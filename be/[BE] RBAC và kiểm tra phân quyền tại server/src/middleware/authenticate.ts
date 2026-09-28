import type { RequestHandler } from 'express';
import { prisma } from '../database/prisma';
import { verifyAccessToken, isTokenRevoked } from '../utils/token';
import { errorResponse } from '../utils/response';

export const authenticate: RequestHandler = async (req, res, next) => {
  const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return errorResponse(res, 'Yêu cầu đăng nhập.', 401, 'UNAUTHORIZED');
  try {
    if (await isTokenRevoked(token)) return errorResponse(res, 'Phiên đăng nhập đã bị thu hồi.', 401, 'TOKEN_REVOKED');
    const payload = verifyAccessToken(token);
    if (!payload) return errorResponse(res, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 401, 'INVALID_TOKEN');
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
    if (!user || !user.isActive) return errorResponse(res, 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.', 401, 'ACCOUNT_INACTIVE');
    if (payload.tokenVersion !== user.tokenVersion) return errorResponse(res, 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.', 401, 'SESSION_INVALIDATED');
    const permissions = new Set<string>();
    const roles = user.roles.map(({ role }) => { role.permissions.forEach(({ permission }) => permissions.add(permission.code)); return role.name; });
    req.user = { id: user.id, email: user.email, fullName: user.fullName, departmentId: user.departmentId, roles, permissions: [...permissions] };
    req.token = token;
    next();
  } catch (error) { next(error); }
};
