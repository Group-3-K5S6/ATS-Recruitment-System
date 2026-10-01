import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../database/prisma';
import { UserPolicy } from '../../policies/user.policy';
import { hashPassword } from '../../utils/password';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';


export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  departmentId: z.string().uuid().optional(),
  roles: z.array(z.nativeEnum(RoleType)).min(1),
});


export const assignRolesSchema = z.object({
  roles: z.array(z.nativeEnum(RoleType)).min(1),
});


export class UserController {
  /*
   * =========================================
   * DANH SÁCH TÀI KHOẢN
   * =========================================
   */
  static async list(
    req: Request,
    res: Response
  ): Promise<void> {
    const user = req.user!;

    if (!UserPolicy.canListUsers(user)) {
      errorResponse(
        res,
        'Access denied. Only HR Managers and Admins can view users.',
        403,
        'FORBIDDEN_ROLE'
      );
      return;
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        departmentId: true,
        isActive: true,
        createdAt: true,

        department: true,

        roles: {
          include: {
            role: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });

    const sanitizedUsers = users.map((u) => ({
      ...u,
      roles: u.roles.map((r) => r.role.name),
    }));

    successResponse(
      res,
      sanitizedUsers,
      200
    );
  }


  /*
   * =========================================
   * TẠO TÀI KHOẢN
   * =========================================
   */
  static async create(
    req: Request,
    res: Response
  ): Promise<void> {
    const data = req.body;
    const user = req.user!;

    if (!UserPolicy.canManageUsers(user)) {
      errorResponse(
        res,
        'Access denied. Only Admins can create internal user accounts.',
        403,
        'FORBIDDEN_ROLE'
      );
      return;
    }

    const existing = await prisma.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (existing) {
      errorResponse(
        res,
        'Email already in use.',
        409,
        'EMAIL_EXISTS'
      );
      return;
    }

    const passwordHash = await hashPassword(
      data.password
    );

    // Lấy ID của các vai trò
    const roles = await prisma.role.findMany({
      where: {
        name: {
          in: data.roles,
        },
      },
    });

    const newUser = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        departmentId: data.departmentId,
        isActive: true,

        roles: {
          create: roles.map((r) => ({
            roleId: r.id,
          })),
        },
      },

      select: {
        id: true,
        email: true,
        fullName: true,
        departmentId: true,
        isActive: true,
        createdAt: true,
      },
    });

    await recordRequestAudit(
      req,
      AuditAction.USER_CREATED,
      'user',
      newUser.id,
      {
        assignedRoles: data.roles,
      }
    );

    successResponse(
      res,
      newUser,
      201,
      'User account created successfully.'
    );
  }


  /*
   * =========================================
   * S1-09 - GÁN / THU HỒI VAI TRÒ
   * =========================================
   */
  static async assignRoles(
    req: Request,
    res: Response
  ): Promise<void> {
    const { id } = req.params;
    const { roles } = req.body;

    const user = req.user!;


    /*
     * Chỉ Admin mới được thay đổi vai trò.
     */
    if (!UserPolicy.canAssignRoles(user)) {
      errorResponse(
        res,
        'Access denied. Only Admins can modify user roles.',
        403,
        'FORBIDDEN_ROLE'
      );

      return;
    }


    /*
     * Lấy người dùng cần cập nhật
     * cùng toàn bộ vai trò hiện tại.
     */
    const targetUser = await prisma.user.findUnique({
      where: {
        id,
      },

      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });


    if (!targetUser) {
      errorResponse(
        res,
        'User not found.',
        404,
        'NOT_FOUND'
      );

      return;
    }


    /*
     * =========================================
     * S1-09:
     * ADMIN KHÔNG ĐƯỢC TỰ THU HỒI ADMIN
     * =========================================
     */

    const isEditingSelf =
      user.id === id;

    const currentlyHasAdminRole =
      targetUser.roles.some(
        (userRole) =>
          userRole.role.name === RoleType.ADMIN
      );

    const willKeepAdminRole =
      roles.includes(RoleType.ADMIN);


    if (
      isEditingSelf &&
      currentlyHasAdminRole &&
      !willKeepAdminRole
    ) {
      errorResponse(
        res,
        'Admin cannot revoke their own ADMIN role.',
        403,
        'CANNOT_REVOKE_OWN_ADMIN_ROLE'
      );

      return;
    }


    /*
     * Lấy các vai trò mới từ database.
     */
    const dbRoles = await prisma.role.findMany({
      where: {
        name: {
          in: roles,
        },
      },
    });


    /*
     * =========================================
     * CẬP NHẬT DANH SÁCH VAI TRÒ
     * =========================================
     *
     * Một tài khoản có thể có nhiều vai trò.
     *
     * Ví dụ:
     *
     * [
     *   "HIRING_MANAGER",
     *   "INTERVIEWER"
     * ]
     *
     * Transaction đảm bảo:
     * - xóa danh sách role cũ
     * - thêm danh sách role mới
     * - nếu lỗi thì rollback toàn bộ
     */
    await prisma.$transaction([
      prisma.userRole.deleteMany({
        where: {
          userId: id,
        },
      }),

      prisma.userRole.createMany({
        data: dbRoles.map((r) => ({
          userId: id,
          roleId: r.id,
        })),
      }),
    ]);


    /*
     * Ghi nhật ký thay đổi vai trò.
     */
    await recordRequestAudit(
      req,
      AuditAction.ROLE_CHANGED,
      'user',
      id,
      {
        newRoles: roles,
      }
    );


    successResponse(
      res,
      {
        message: 'Roles updated successfully',
        roles,
      },
      200
    );
  }


  /*
   * =========================================
   * KHÓA TÀI KHOẢN
   * =========================================
   */
  static async disable(
    req: Request,
    res: Response
  ): Promise<void> {
    const { id } = req.params;
    const user = req.user!;


    if (!UserPolicy.canDisableUser(user, id)) {
      errorResponse(
        res,
        'Access denied. Cannot disable user account or self.',
        403,
        'FORBIDDEN_ACTION'
      );

      return;
    }


    const updated = await prisma.user.update({
      where: {
        id,
      },

      data: {
        isActive: false,
      },

      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });


    await recordRequestAudit(
      req,
      AuditAction.USER_DISABLED,
      'user',
      id
    );


    successResponse(
      res,
      updated,
      200,
      'User account has been disabled.'
    );
  }
}