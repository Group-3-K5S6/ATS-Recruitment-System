import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../database/prisma';

import { UserPolicy } from '../../policies/user.policy';

import { hashPassword } from '../../utils/password';
import crypto from 'crypto';
import { hashToken } from '../../utils/token';
import { sendEmployeeActivationEmail } from '../../utils/email';

import {
  successResponse,
  errorResponse,
} from '../../utils/response';

import { recordRequestAudit } from '../../middleware/audit-logger';

import { AuditAction } from '../../rbac/types';

import { RoleType } from '../../rbac/roles';


/*
 * =========================================
 * VALIDATION
 * =========================================
 */

export const createUserSchema = z.object({
  email: z.string().email(),

  fullName: z.string().min(2),

  departmentId: z
    .string()
    .uuid()
    .optional(),

  roles: z
    .array(z.nativeEnum(RoleType))
    .min(1),
});


export const updateUserSchema = z.object({
  email: z.string().email(),

  fullName: z.string().min(2),
});


export const assignRolesSchema = z.object({
  roles: z
    .array(z.nativeEnum(RoleType))
    .min(1),
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


    const users =
      await prisma.user.findMany({

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


    const sanitizedUsers =
      users.map((u) => ({

        ...u,

        roles:
          u.roles.map(
            (r) => r.role.name
          ),

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
    data.email = String(data.email).trim().toLowerCase();

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


    const existing =
      await prisma.user.findUnique({

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


    const temporaryPassword = crypto.randomBytes(9).toString('base64url');
    const activationToken = crypto.randomBytes(32).toString('hex');
    const activationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const passwordHash = await hashPassword(temporaryPassword);


    const roles =
      await prisma.role.findMany({

        where: {

          name: {

            in: data.roles,

          },

        },

      });


    const newUser =
      await prisma.user.create({

        data: {

          email:
            data.email,

          passwordHash,

          fullName:
            data.fullName,

          departmentId:
            data.departmentId,

          isActive: false,
          mustChangePassword: true,
          activationTokenHash: hashToken(activationToken),
          activationExpiresAt,


          roles: {

            create:
              roles.map((r) => ({

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

        assignedRoles:
          data.roles,

      }
    );

    try {
      await sendEmployeeActivationEmail(newUser.email, temporaryPassword, activationToken, activationExpiresAt);
    } catch (error) {
      await prisma.user.delete({ where: { id: newUser.id } });
      throw error;
    }


    successResponse(
      res,
      newUser,
      201,
      'Tài khoản đã được tạo và email kích hoạt đã gửi.'
    );
  }


  /*
   * =========================================
   * S1-08 - SỬA TÀI KHOẢN
   * =========================================
   */

  static async update(
    req: Request,
    res: Response
  ): Promise<void> {

    const { id } = req.params;

    const data = req.body;

    const user = req.user!;


    if (!UserPolicy.canManageUsers(user)) {

      errorResponse(
        res,
        'Access denied. Only Admins can update internal user accounts.',
        403,
        'FORBIDDEN_ROLE'
      );

      return;
    }


    const targetUser =
      await prisma.user.findUnique({

        where: {

          id,

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


    const emailOwner =
      await prisma.user.findUnique({

        where: {

          email: data.email,

        },

      });


    if (
      emailOwner &&
      emailOwner.id !== id
    ) {

      errorResponse(
        res,
        'Email already in use.',
        409,
        'EMAIL_EXISTS'
      );

      return;
    }


    const updated =
      await prisma.user.update({

        where: {

          id,

        },


        data: {

          email:
            data.email,

          fullName:
            data.fullName,

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


    successResponse(
      res,
      updated,
      200,
      'User account updated successfully.'
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

    const { id } =
      req.params;

    const { roles } =
      req.body;

    const user =
      req.user!;


    if (!UserPolicy.canAssignRoles(user)) {

      errorResponse(
        res,
        'Access denied. Only Admins can modify user roles.',
        403,
        'FORBIDDEN_ROLE'
      );

      return;
    }


    const targetUser =
      await prisma.user.findUnique({

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
     * Admin không được
     * tự thu hồi quyền Admin.
     */

    const isEditingSelf =
      user.id === id;


    const currentlyHasAdminRole =
      targetUser.roles.some(

        (userRole) =>
          userRole.role.name ===
          RoleType.ADMIN

      );


    const willKeepAdminRole =
      roles.includes(
        RoleType.ADMIN
      );


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


    const dbRoles =
      await prisma.role.findMany({

        where: {

          name: {

            in: roles,

          },

        },

      });


    await prisma.$transaction([

      prisma.userRole.deleteMany({

        where: {

          userId: id,

        },

      }),


      prisma.userRole.createMany({

        data:
          dbRoles.map(
            (r) => ({

              userId: id,

              roleId: r.id,

            })
          ),

      }),

    ]);


    await recordRequestAudit(
      req,
      AuditAction.ROLE_CHANGED,
      'user',
      id,
      {

        newRoles:
          roles,

      }
    );


    successResponse(
      res,
      {

        message:
          'Roles updated successfully',

        roles,

      },
      200
    );
  }


  /*
   * =========================================
   * S1-10 - KHÓA TÀI KHOẢN
   * =========================================
   */

  static async disable(
    req: Request,
    res: Response
  ): Promise<void> {

    const { id } =
      req.params;

    const user =
      req.user!;


    if (
      !UserPolicy.canDisableUser(
        user,
        id
      )
    ) {

      errorResponse(
        res,
        'Access denied. Cannot disable user account or self.',
        403,
        'FORBIDDEN_ACTION'
      );

      return;
    }


    const targetUser =
      await prisma.user.findUnique({

        where: {

          id,

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


    const updated =
      await prisma.user.update({

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


  /*
   * =========================================
   * S1-10 - MỞ KHÓA TÀI KHOẢN
   * =========================================
   */

  static async enable(
    req: Request,
    res: Response
  ): Promise<void> {

    const { id } =
      req.params;

    const user =
      req.user!;


    if (!UserPolicy.canManageUsers(user)) {

      errorResponse(
        res,
        'Access denied. Only Admins can enable user accounts.',
        403,
        'FORBIDDEN_ACTION'
      );

      return;
    }


    const targetUser =
      await prisma.user.findUnique({

        where: {

          id,

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


    const updated =
      await prisma.user.update({

        where: {

          id,

        },


        data: {

          isActive: true,

        },


        select: {

          id: true,

          email: true,

          isActive: true,

        },

      });


    successResponse(
      res,
      updated,
      200,
      'User account has been enabled.'
    );
  }
}
