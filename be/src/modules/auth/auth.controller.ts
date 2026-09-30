import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { comparePassword, hashPassword } from '../../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken, revokeToken } from '../../utils/token';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { PermissionCode } from '../../rbac/permissions';
import crypto from 'crypto';
import { sendPasswordResetOtp, sendRegistrationOtp } from '../../utils/email';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string(),
});
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export const verifyOtpSchema = z.object({ email: z.string().email(), otp: z.string().regex(/^\d{6}$/) });
export const verifyRegistrationOtpSchema = verifyOtpSchema;
export const resetPasswordSchema = z.object({ resetToken: z.string().min(32), password: z.string().min(8) });
const RESET_MESSAGE = 'Nếu email này tồn tại trong hệ thống, mã OTP sẽ được gửi đến email đó.';
const OTP_TTL_MS = 10 * 60 * 1000;
const registerOtpSchema = z.object({ email: z.string().email(), password: z.string().min(8), fullName: z.string().min(2), phone: z.string().optional() });

export class AuthController {
  static async forgotPassword(req: Request, res: Response): Promise<void> {
    const email = String(req.body.email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      successResponse(res, { message: RESET_MESSAGE }, 200);
      return;
    }
    const existing = await prisma.passwordResetOtp.findUnique({ where: { userId: user.id } });
    if (existing && Date.now() - existing.createdAt.getTime() < 60_000) {
      successResponse(res, { message: RESET_MESSAGE }, 200);
      return;
    }
    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = crypto.createHash('sha256').update(`${user.id}:${otp}`).digest('hex');
    await prisma.passwordResetOtp.upsert({
      where: { userId: user.id },
      create: { userId: user.id, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      update: { codeHash, resetTokenHash: null, attempts: 0, verifiedAt: null, expiresAt: new Date(Date.now() + OTP_TTL_MS), createdAt: new Date() },
    });
    try {
      await sendPasswordResetOtp(user.email, otp);
    } catch {
      await prisma.passwordResetOtp.delete({ where: { userId: user.id } }).catch(() => undefined);
      const deliveryError = Object.assign(new Error('Email OTP delivery failed.'), {
        statusCode: 503,
        code: 'EMAIL_DELIVERY_FAILED',
        publicMessage: 'Không thể gửi mã OTP lúc này. Vui lòng kiểm tra cấu hình email hoặc liên hệ quản trị viên.',
      });
      throw deliveryError;
    }
    successResponse(res, { message: RESET_MESSAGE }, 200);
  }

  static async verifyPasswordResetOtp(req: Request, res: Response): Promise<void> {
    const email = String(req.body.email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    const challenge = user && user.isActive
      ? await prisma.passwordResetOtp.findUnique({ where: { userId: user.id } })
      : null;
    if (!user || !challenge || challenge.expiresAt <= new Date() || challenge.verifiedAt || challenge.attempts >= 5) {
      errorResponse(res, 'OTP không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu mã mới.', 400, 'INVALID_OTP');
      return;
    }
    const expectedHash = crypto.createHash('sha256').update(`${user.id}:${req.body.otp}`).digest('hex');
    if (expectedHash !== challenge.codeHash) {
      const attempts = challenge.attempts + 1;
      await prisma.passwordResetOtp.update({
        where: { userId: user.id },
        data: attempts >= 5 ? { attempts, expiresAt: new Date() } : { attempts },
      });
      errorResponse(res, 'OTP không đúng.', 400, 'INVALID_OTP');
      return;
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    await prisma.passwordResetOtp.update({
      where: { userId: user.id },
      data: { resetTokenHash, verifiedAt: new Date(), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    successResponse(res, { resetToken, expiresInSeconds: 600 }, 200, 'OTP verified');
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(req.body.resetToken).digest('hex');
    const challenge = await prisma.passwordResetOtp.findFirst({ where: { resetTokenHash: tokenHash } });
    if (!challenge || !challenge.verifiedAt || challenge.expiresAt <= new Date()) {
      errorResponse(res, 'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng xác thực OTP lại.', 400, 'INVALID_RESET_TOKEN');
      return;
    }
    const passwordHash = await hashPassword(req.body.password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: challenge.userId }, data: { passwordHash } }),
      prisma.passwordResetOtp.delete({ where: { userId: challenge.userId } }),
    ]);
    successResponse(res, { message: 'Password reset successful.' }, 200);
  }

  static async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      errorResponse(res, 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');
      return;
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      errorResponse(res, 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');
      return;
    }

    const roles: RoleType[] = [];
    const permissionSet = new Set<PermissionCode>();

    for (const ur of user.roles) {
      roles.push(ur.role.name as RoleType);
      for (const rp of ur.role.permissions) {
        permissionSet.add(rp.permission.code as PermissionCode);
      }
    }

    const payload = { userId: user.id, email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await recordRequestAudit(req, AuditAction.LOGIN, 'user', user.id, {
      email: user.email,
    });

    successResponse(
      res,
      {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          departmentId: user.departmentId,
          roles,
          permissions: Array.from(permissionSet),
        },
      },
      200,
      'Login successful'
    );
  }

  static async register(req: Request, res: Response): Promise<void> {
    const parsed = registerOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      errorResponse(res, 'Thông tin đăng ký không hợp lệ.', 400, 'INVALID_REGISTRATION');
      return;
    }
    const { password, fullName, phone } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      errorResponse(res, 'Email is already registered.', 409, 'EMAIL_EXISTS');
      return;
    }

    const passwordHash = await hashPassword(password);
    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = crypto.createHash('sha256').update(`${email}:${otp}`).digest('hex');
    await prisma.registrationOtp.upsert({
      where: { email },
      create: { email, fullName, phone: phone || null, passwordHash, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      update: { fullName, phone: phone || null, passwordHash, codeHash, attempts: 0, expiresAt: new Date(Date.now() + OTP_TTL_MS), createdAt: new Date() },
    });
    try {
      await sendRegistrationOtp(email, otp);
    } catch {
      await prisma.registrationOtp.delete({ where: { email } }).catch(() => undefined);
      const deliveryError = Object.assign(new Error('Registration email OTP delivery failed.'), {
        statusCode: 503, code: 'EMAIL_DELIVERY_FAILED',
        publicMessage: 'Không thể gửi mã OTP. Vui lòng kiểm tra cấu hình Gmail SMTP.',
      });
      throw deliveryError;
    }
    successResponse(res, { message: 'Mã OTP đã được gửi đến email của bạn.' }, 200, 'Registration OTP sent');
  }

  static async verifyRegistrationOtp(req: Request, res: Response): Promise<void> {
    const email = String(req.body.email).trim().toLowerCase();
    const challenge = await prisma.registrationOtp.findUnique({ where: { email } });
    if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
      errorResponse(res, 'OTP không hợp lệ hoặc đã hết hạn. Vui lòng đăng ký lại.', 400, 'INVALID_OTP');
      return;
    }
    const expectedHash = crypto.createHash('sha256').update(`${email}:${req.body.otp}`).digest('hex');
    if (expectedHash !== challenge.codeHash) {
      const attempts = challenge.attempts + 1;
      await prisma.registrationOtp.update({ where: { email }, data: attempts >= 5 ? { attempts, expiresAt: new Date() } : { attempts } });
      errorResponse(res, 'OTP không đúng.', 400, 'INVALID_OTP');
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.registrationOtp.delete({ where: { email } });
      errorResponse(res, 'Email đã được đăng ký.', 409, 'EMAIL_EXISTS');
      return;
    }
    const candidateRole = await prisma.role.findUnique({ where: { name: RoleType.CANDIDATE } });

    if (!candidateRole) {
      errorResponse(res, 'Candidate role not configured.', 500, 'ROLE_MISSING');
      return;
    }

    const newUser = await prisma.user.create({
      data: {
        email: challenge.email,
        passwordHash: challenge.passwordHash,
        fullName: challenge.fullName,
        isActive: true,
        roles: {
          create: {
            roleId: candidateRole.id,
          },
        },
        candidateProfile: {
          create: {
            fullName: challenge.fullName,
            email: challenge.email,
            phone: challenge.phone,
          },
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
      },
    });
    await prisma.registrationOtp.delete({ where: { email } });

    await recordRequestAudit(req, AuditAction.USER_CREATED, 'user', newUser.id, {
      role: RoleType.CANDIDATE,
    });

    successResponse(res, newUser, 201, 'Registration successful. Candidate profile created.');
  }

  static async logout(req: Request, res: Response): Promise<void> {
    if (req.token) {
      await revokeToken(req.token);
    }

    if (req.user) {
      await recordRequestAudit(req, AuditAction.LOGOUT, 'user', req.user.id);
    }

    successResponse(res, { message: 'Logged out successfully' }, 200);
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    const payload = verifyRefreshToken(refreshToken);

    if (!payload) {
      errorResponse(res, 'Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
      return;
    }

    const newAccessToken = signAccessToken({ userId: payload.userId, email: payload.email });
    successResponse(res, { accessToken: newAccessToken }, 200);
  }

  static async me(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      errorResponse(res, 'Not authenticated', 401, 'UNAUTHORIZED');
      return;
    }

    successResponse(res, req.user, 200);
  }
}
