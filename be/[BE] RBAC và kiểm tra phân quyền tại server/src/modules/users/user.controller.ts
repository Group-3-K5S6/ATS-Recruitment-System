import { z } from 'zod';
import type { RequestHandler } from 'express';
import { prisma } from '../../database/prisma';
import { ALL_ROLES } from '../../rbac/roles';
import { hashPassword } from '../../utils/password';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';

const createUserSchema = z.object({ email: z.string().email().transform((v) => v.trim().toLowerCase()), password: z.string().min(8), fullName: z.string().trim().min(2).max(120), departmentId: z.string().optional(), roles: z.array(z.enum(ALL_ROLES as [string, ...string[]])).min(1) });
const rolesSchema = z.object({ roles: z.array(z.enum(ALL_ROLES as [string, ...string[]])).min(1) });
const profileSchema = z.object({ fullName: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().max(30).nullable().optional(), title: z.string().trim().max(120).nullable().optional(), avatarUrl: z.string().url().nullable().optional(), timezone: z.string().trim().max(80).optional() }).strict();

export class UserController {
  static list: RequestHandler = async (_req, res, next) => {
    try {
      const users = await prisma.user.findMany({ select: { id: true, email: true, fullName: true, phone: true, departmentId: true, isActive: true, createdAt: true, updatedAt: true, profile: true, roles: { include: { role: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } });
      return successResponse(res, users.map((user) => ({ ...user, roles: user.roles.map(({ role }) => role.name) })));
    } catch (error) { next(error); }
  };

  static create: RequestHandler = async (req, res, next) => {
    try {
      const input = createUserSchema.parse(req.body);
      if (await prisma.user.findUnique({ where: { email: input.email } })) return errorResponse(res, 'Email đã được sử dụng.', 409, 'EMAIL_EXISTS');
      const dbRoles = await prisma.role.findMany({ where: { name: { in: input.roles } } });
      if (dbRoles.length !== new Set(input.roles).size) return errorResponse(res, 'Vai trò chưa được khởi tạo. Hãy chạy npm run prisma:seed.', 400, 'ROLE_MISSING');
      const created = await prisma.user.create({ data: { email: input.email, passwordHash: await hashPassword(input.password), fullName: input.fullName, departmentId: input.departmentId, roles: { create: dbRoles.map((role) => ({ roleId: role.id })) }, profile: { create: {} } }, select: { id: true, email: true, fullName: true, departmentId: true, isActive: true, createdAt: true } });
      await recordRequestAudit(req, 'USER_CREATED', 'user', created.id, { assignedRoles: input.roles });
      return successResponse(res, created, 201, 'Đã tạo tài khoản nội bộ.');
    } catch (error) { next(error); }
  };

  static assignRoles: RequestHandler = async (req, res, next) => {
    try {
      const { roles } = rolesSchema.parse(req.body);
      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!target) return errorResponse(res, 'Không tìm thấy tài khoản.', 404, 'NOT_FOUND');
      const dbRoles = await prisma.role.findMany({ where: { name: { in: roles } } });
      if (dbRoles.length !== new Set(roles).size) return errorResponse(res, 'Vai trò không hợp lệ.', 400, 'ROLE_MISSING');
      await prisma.$transaction([prisma.userRole.deleteMany({ where: { userId: target.id } }), prisma.userRole.createMany({ data: dbRoles.map((role) => ({ userId: target.id, roleId: role.id })) })]);
      await recordRequestAudit(req, 'ROLE_CHANGED', 'user', target.id, { newRoles: roles });
      return successResponse(res, { message: 'Đã cập nhật vai trò.', roles });
    } catch (error) { next(error); }
  };

  static disable: RequestHandler = async (req, res, next) => {
    try {
      if (req.params.id === req.user?.id) return errorResponse(res, 'Không thể tự vô hiệu hóa tài khoản của mình.', 403, 'FORBIDDEN_ACTION');
      const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false }, select: { id: true, email: true, isActive: true } });
      await recordRequestAudit(req, 'USER_DISABLED', 'user', user.id);
      return successResponse(res, user);
    } catch (error) { next(error); }
  };

  static getProfile: RequestHandler = async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, fullName: true, phone: true, departmentId: true, isActive: true, createdAt: true, updatedAt: true, roles: { include: { role: { select: { name: true } } } }, profile: true } });
      if (!user) return errorResponse(res, 'Không tìm thấy tài khoản.', 404, 'NOT_FOUND');
      return successResponse(res, { ...user, roles: user.roles.map(({ role }) => role.name) });
    } catch (error) { next(error); }
  };

  static updateProfile: RequestHandler = async (req, res, next) => {
    try {
      const data = profileSchema.parse(req.body);
      const { title, avatarUrl, timezone, ...userData } = data;
      const profile = await prisma.userProfile.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, title, avatarUrl, timezone, phone: userData.phone ?? undefined }, update: { title, avatarUrl, timezone, phone: userData.phone } });
      const user = await prisma.user.update({ where: { id: req.user!.id }, data: { ...(userData.fullName === undefined ? {} : { fullName: userData.fullName }), ...(userData.phone === undefined ? {} : { phone: userData.phone }) }, select: { id: true, email: true, fullName: true, phone: true, departmentId: true } });
      await recordRequestAudit(req, 'PROFILE_UPDATED', 'user', user.id);
      return successResponse(res, { ...user, profile });
    } catch (error) { next(error); }
  };

  static changePassword: RequestHandler = async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^A-Za-z0-9]/) }).parse(req.body);
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user || !(await (await import('../../utils/password')).comparePassword(currentPassword, user.passwordHash))) return errorResponse(res, 'Mật khẩu hiện tại không chính xác.', 400, 'INVALID_PASSWORD');
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } } });
      await recordRequestAudit(req, 'PASSWORD_CHANGED', 'user', user.id);
      return successResponse(res, { message: 'Đã đổi mật khẩu. Hãy đăng nhập lại.' });
    } catch (error) { next(error); }
  };
}
