import crypto from 'node:crypto';
import { z } from 'zod';
import type { Request, Response, RequestHandler } from 'express';
import { prisma } from '../../database/prisma';
import { hashPassword, comparePassword } from '../../utils/password';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken, revokeToken } from '../../utils/token';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { RoleType } from '../../rbac/roles';
import { env } from '../../config/env';

export const loginSchema = z.object({ email: z.string().email().transform((v) => v.trim().toLowerCase()), password: z.string().min(1) });
export const registerSchema = z.object({ email: z.string().email().transform((v) => v.trim().toLowerCase()), password: z.string().min(8), fullName: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).optional() });
export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const publicUser = (user: { id: string; email: string; fullName: string; departmentId: string | null; roles: { role: { name: string; permissions: { permission: { code: string } }[] } }[] }) => {
  const permissions = new Set<string>();
  const roles = user.roles.map(({ role }) => { role.permissions.forEach(({ permission }) => permissions.add(permission.code)); return role.name; });
  return { id: user.id, email: user.email, fullName: user.fullName, departmentId: user.departmentId, roles, permissions: [...permissions] };
};
const userWithGrants = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } as const;
const hashOtp = (userId: string, code: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(`${userId}:${code}`).digest('hex');
const hashesMatch = (stored: string, supplied: string) => {
  const left = Buffer.from(stored, 'hex');
  const right = Buffer.from(supplied, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};
const strongPassword = z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^A-Za-z0-9]/);

export class AuthController {
  static login: RequestHandler = async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { email }, include: userWithGrants });
      if (!user || !user.isActive || !(await comparePassword(password, user.passwordHash))) return errorResponse(res, 'Email hoặc mật khẩu không chính xác.', 401, 'INVALID_CREDENTIALS');
      const payload = { userId: user.id, email: user.email, tokenVersion: user.tokenVersion };
      await recordRequestAudit(req, 'LOGIN', 'user', user.id);
      return successResponse(res, { accessToken: signAccessToken(payload), refreshToken: signRefreshToken(payload), user: publicUser(user) }, 200, 'Đăng nhập thành công.');
    } catch (error) { next(error); }
  };

  static register: RequestHandler = async (req, res, next) => {
    try {
      const input = registerSchema.parse(req.body);
      if (await prisma.user.findUnique({ where: { email: input.email } })) return errorResponse(res, 'Email đã được sử dụng.', 409, 'EMAIL_EXISTS');
      const role = await prisma.role.findUnique({ where: { name: RoleType.CANDIDATE } });
      if (!role) return errorResponse(res, 'Chưa khởi tạo dữ liệu vai trò. Hãy chạy npm run prisma:seed.', 503, 'ROLE_MISSING');
      const user = await prisma.user.create({ data: { email: input.email, passwordHash: await hashPassword(input.password), fullName: input.fullName, phone: input.phone, roles: { create: { roleId: role.id } }, profile: { create: { phone: input.phone } } }, select: { id: true, email: true, fullName: true, createdAt: true } });
      await recordRequestAudit(req, 'USER_CREATED', 'user', user.id, { role: RoleType.CANDIDATE });
      return successResponse(res, user, 201, 'Tạo tài khoản thành công.');
    } catch (error) { next(error); }
  };

  static logout: RequestHandler = async (req, res, next) => {
    try {
      if (req.token) await revokeToken(req.token, req.user?.id);
      const refreshToken = req.body?.refreshToken;
      if (typeof refreshToken === 'string') { const payload = verifyRefreshToken(refreshToken); if (payload && payload.userId === req.user?.id) await revokeToken(refreshToken, payload.userId); }
      if (req.user) await recordRequestAudit(req, 'LOGOUT', 'user', req.user.id);
      return successResponse(res, { message: 'Đã đăng xuất.' });
    } catch (error) { next(error); }
  };

  static refresh: RequestHandler = async (req, res, next) => {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      const payload = verifyRefreshToken(refreshToken);
      if (!payload || await prisma.revokedToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } })) return errorResponse(res, 'Refresh token không hợp lệ hoặc đã bị thu hồi.', 401, 'INVALID_REFRESH_TOKEN');
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user?.isActive) return errorResponse(res, 'Tài khoản không hoạt động.', 401, 'ACCOUNT_INACTIVE');
      if (payload.tokenVersion !== user.tokenVersion) return errorResponse(res, 'Phiên đăng nhập đã hết hiệu lực.', 401, 'INVALID_REFRESH_TOKEN');
      await revokeToken(refreshToken, user.id);
      const nextPayload = { userId: user.id, email: user.email, tokenVersion: user.tokenVersion };
      return successResponse(res, { accessToken: signAccessToken(nextPayload), refreshToken: signRefreshToken(nextPayload) });
    } catch (error) { next(error); }
  };

  static me: RequestHandler = (req, res) => req.user ? successResponse(res, req.user) : errorResponse(res, 'Chưa đăng nhập.', 401, 'UNAUTHORIZED');

  static forgotPassword: RequestHandler = async (req, res, next) => {
    try {
      const { email } = z.object({ email: z.string().email().transform((v) => v.trim().toLowerCase()) }).parse(req.body);
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true } });
      let previewCode: string | undefined;
      if (user?.isActive) {
        const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
        await prisma.passwordResetCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
        await prisma.passwordResetCode.create({ data: { userId: user.id, codeHash: hashOtp(user.id, code), expiresAt: new Date(Date.now() + 30 * 60_000) } });
        // Wire this point to the company mail provider before production. Expose code only in local development for UI integration.
        if (process.env.NODE_ENV !== 'production') previewCode = code;
      }
      return successResponse(res, { ...(previewCode ? { previewCode } : {}) }, 200, 'Nếu email tồn tại, mã xác thực sẽ được gửi và có hiệu lực trong 30 phút.');
    } catch (error) { next(error); }
  };

  static verifyResetCode: RequestHandler = async (req, res, next) => {
    try {
      const { email, code } = z.object({ email: z.string().email().transform((v) => v.trim().toLowerCase()), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
      const user = await prisma.user.findUnique({ where: { email } });
      const challenge = user && await prisma.passwordResetCode.findFirst({ where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } }, orderBy: { createdAt: 'desc' } });
      if (!user || !challenge || !hashesMatch(challenge.codeHash, hashOtp(user.id, code))) {
        if (challenge) await prisma.passwordResetCode.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
        return errorResponse(res, 'Mã xác thực không đúng hoặc đã hết hạn.', 400, 'INVALID_RESET_CODE');
      }
      const resetToken = crypto.randomBytes(32).toString('hex');
      await prisma.passwordResetCode.update({ where: { id: challenge.id }, data: { usedAt: new Date(), codeHash: hashToken(resetToken) } });
      return successResponse(res, { resetToken, expiresIn: 600 });
    } catch (error) { next(error); }
  };

  static resetPassword: RequestHandler = async (req, res, next) => {
    try {
      const { resetToken, newPassword } = z.object({ resetToken: z.string().min(32), newPassword: strongPassword }).parse(req.body);
      const reset = await prisma.passwordResetCode.findFirst({ where: { codeHash: hashToken(resetToken), usedAt: { not: null }, expiresAt: { gt: new Date(Date.now() - 10 * 60_000) } }, orderBy: { createdAt: 'desc' } });
      if (!reset || reset.codeHash !== hashToken(resetToken) || reset.usedAt! < new Date(Date.now() - 10 * 60_000)) return errorResponse(res, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.', 400, 'INVALID_RESET_TOKEN');
      await prisma.$transaction([
        prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } } }),
        prisma.passwordResetCode.deleteMany({ where: { userId: reset.userId } }),
      ]);
      await prisma.revokedToken.create({ data: { userId: reset.userId, tokenHash: `reset-${crypto.randomUUID()}`, expiresAt: new Date(Date.now() + 60_000) } }).catch(() => undefined);
      return successResponse(res, { message: 'Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.' });
    } catch (error) { next(error); }
  };
}
