import type { RequestHandler } from 'express';
import { RoleType } from '../rbac/roles';
import { errorResponse } from '../utils/response';
export const requirePermission = (...required: string[]): RequestHandler => (req, res, next) => {
  if (!req.user) return errorResponse(res, 'Yêu cầu đăng nhập trước khi kiểm tra quyền.', 401, 'UNAUTHORIZED');
  if (req.user.roles.includes(RoleType.ADMIN) || required.some((permission) => req.user!.permissions.includes(permission))) return next();
  return errorResponse(res, 'Bạn không có quyền thực hiện thao tác này.', 403, 'FORBIDDEN_PERMISSION');
};
export const requireRole = (...roles: string[]): RequestHandler => (req, res, next) => {
  if (!req.user) return errorResponse(res, 'Yêu cầu đăng nhập.', 401, 'UNAUTHORIZED');
  if (roles.some((role) => req.user!.roles.includes(role))) return next();
  return errorResponse(res, 'Vai trò hiện tại không được phép thực hiện thao tác này.', 403, 'FORBIDDEN_ROLE');
};
