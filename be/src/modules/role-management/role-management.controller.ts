import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../database/prisma';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { RoleType } from '../../rbac/roles';
import { AuditAction } from '../../rbac/types';
import { errorResponse, successResponse } from '../../utils/response';

/** Các endpoint quản trị vai trò dùng chung Prisma, xác thực và audit với backend ATS. */
export class RoleManagementController {
  /** Trả về danh sách mã vai trò được hệ thống hỗ trợ. */
  static listRoles(_req: Request, res: Response): void {
    successResponse(res, Object.values(RoleType), 200, 'Roles loaded.');
  }

  /** Liệt kê tài khoản và vai trò hiện tại, không trả về thông tin nhạy cảm. */
  static async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          isActive: true,
          department: { select: { name: true } },
          roles: { include: { role: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });

      successResponse(res, users.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        department: user.department?.name || '',
        roles: user.roles.map(({ role }) => role.name),
      })), 200, 'Users loaded.');
    } catch (error) {
      next(error);
    }
  }

  /** Gán một vai trò cho tài khoản, giữ nguyên các vai trò đã có. */
  static async assignRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roleName = req.body?.role;
      if (!Object.values(RoleType).includes(roleName)) {
        errorResponse(res, 'Select a valid role.', 400, 'INVALID_ROLE');
        return;
      }

      const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!target) {
        errorResponse(res, 'User not found.', 404, 'NOT_FOUND');
        return;
      }

      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) {
        errorResponse(res, 'Role is not configured.', 404, 'ROLE_NOT_FOUND');
        return;
      }

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: target.id, roleId: role.id } },
        create: { userId: target.id, roleId: role.id },
        update: {},
      });
      await recordRequestAudit(req, AuditAction.ROLE_CHANGED, 'user', target.id, {
        change: 'assigned',
        role: roleName,
      });
      successResponse(res, { userId: target.id, role: roleName }, 200, 'Role assigned.');
    } catch (error) {
      next(error);
    }
  }

  /** Thu hồi vai trò, đồng thời bảo vệ tài khoản khỏi mất Admin cuối cùng. */
  static async revokeRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roleName = req.params.role.toUpperCase();
      if (!Object.values(RoleType).includes(roleName as RoleType)) {
        errorResponse(res, 'Select a valid role.', 400, 'INVALID_ROLE');
        return;
      }

      const target = await prisma.user.findUnique({
        where: { id: req.params.userId },
        include: { roles: { include: { role: true } } },
      });
      if (!target) {
        errorResponse(res, 'User not found.', 404, 'NOT_FOUND');
        return;
      }

      const assignedRole = target.roles.find(({ role }) => role.name === roleName);
      if (!assignedRole) {
        errorResponse(res, 'User does not have this role.', 404, 'ROLE_NOT_ASSIGNED');
        return;
      }

      if (req.user?.id === target.id && roleName === RoleType.ADMIN) {
        errorResponse(res, 'You cannot revoke your own Admin role.', 409, 'CANNOT_REVOKE_SELF_ADMIN');
        return;
      }

      if (roleName === RoleType.ADMIN) {
        const activeAdminCount = await prisma.userRole.count({
          where: { roleId: assignedRole.roleId, user: { isActive: true } },
        });
        if (target.isActive && activeAdminCount <= 1) {
          errorResponse(res, 'At least one active Admin must remain.', 409, 'LAST_ADMIN');
          return;
        }
      }

      await prisma.userRole.delete({
        where: { userId_roleId: { userId: target.id, roleId: assignedRole.roleId } },
      });
      await recordRequestAudit(req, AuditAction.ROLE_CHANGED, 'user', target.id, {
        change: 'revoked',
        role: roleName,
      });
      successResponse(res, { userId: target.id, role: roleName }, 200, 'Role revoked.');
    } catch (error) {
      next(error);
    }
  }
}
