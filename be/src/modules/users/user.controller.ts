import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../database/prisma';

import { UserPolicy } from '../../policies/user.policy';

import { hashPassword } from '../../utils/password';

import { randomUUID } from 'crypto';

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

  password: z.string().min(6),

  fullName: z.string().min(2),

  departmentId: z
    .string()
    .uuid()
    .optional(),

  roles: z
    .array(z.nativeEnum(RoleType))
    .min(1),
});

export const importEmployeeRowSchema = z.object({
  HoTen: z.string().optional().default(""),
  Email: z.string().optional().default(""),
  PhongBan: z.string().optional().default(""),
  ChucVu: z.string().optional().default(""),
  SoDienThoai: z.string().optional().default(""),
  rowNumber: z.number().optional(),
});

export const importPayloadSchema = z.object({
  employees: z.array(importEmployeeRowSchema).min(1),
});

export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Họ tên phải có ít nhất 2 ký tự")
      .optional(),

    phone: z
      .string()
      .trim()
      .regex(
        /^(?:\+?84|0)(?:3|5|7|8|9)\d{8}$/,
        "Số điện thoại Việt Nam không hợp lệ",
      )
      .optional(),

    jobTitle: z
      .string()
      .trim()
      .min(1, "Chức danh hiển thị không được để trống")
      .optional(),
  })
  .strict();

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

static async getProfile(
  req: Request,
  res: Response,
): Promise<void> {
  const user = req.user!;

  const profile = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      jobTitle: true,
      departmentId: true,
      department: {
        select: {
          id: true,
          name: true,
        },
      },
      roles: {
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!profile) {
    errorResponse(
      res,
      "Không tìm thấy hồ sơ người dùng.",
      404,
      "USER_NOT_FOUND",
    );
    return;
  }

  successResponse(
    res,
    {
      ...profile,
      roles: profile.roles.map(
        (item) => item.role.name,
      ),
    },
    200,
  );
}

static async updateProfile(
  req: Request,
  res: Response,
): Promise<void> {
  const user = req.user!;

  const {
    fullName,
    phone,
    jobTitle,
  } = req.body;

  const updateData: {
    fullName?: string;
    phone?: string;
    jobTitle?: string;
  } = {};

  if (fullName !== undefined) {
    updateData.fullName = fullName;
  }

  if (phone !== undefined) {
    updateData.phone = phone;
  }

  if (jobTitle !== undefined) {
    updateData.jobTitle = jobTitle;
  }

  const updated =
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        jobTitle: true,
        departmentId: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

  await recordRequestAudit(
    req,
    AuditAction.USER_UPDATED,
    "user",
    user.id,
    {
      updatedFields: Object.keys(updateData),
    },
  );

  successResponse(
    res,
    {
      ...updated,
      roles: updated.roles.map(
        (item) => item.role.name,
      ),
    },
    200,
    "Cập nhật hồ sơ cá nhân thành công.",
  );
}

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


    const passwordHash =
      await hashPassword(
        data.password
      );


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

          isActive: true,


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


    successResponse(
      res,
      newUser,
      201,
      'User account created successfully.'
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
    static async previewImport(
    req: Request,
    res: Response
  ): Promise<void> {
    const user = req.user!;

    if (!UserPolicy.canManageUsers(user)) {
      errorResponse(
        res,
        "Bạn không có quyền nhập danh sách nhân sự.",
        403,
        "FORBIDDEN_ROLE"
      );
      return;
    }

    const { employees } = req.body;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const phonePattern = /^(?:\+?84|0)(?:3|5|7|8|9)\d{8}$/;

    const existingUsers = await prisma.user.findMany({
      select: {
        email: true,
      },
    });

    const existingEmails = new Set(
      existingUsers.map((item) => item.email.toLowerCase())
    );

    const departments = await prisma.department.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    const departmentNames = new Set(
      departments.map((item) =>
        item.name.trim().toLowerCase()
      )
    );

    const seenEmails = new Set<string>();

    const rows = employees.map(
      (employee: any, index: number) => {
        const errors: string[] = [];

        const rowNumber =
          employee.rowNumber ?? index + 2;

        const fullName = String(
          employee.HoTen ?? ""
        ).trim();

        const email = String(
          employee.Email ?? ""
        )
          .trim()
          .toLowerCase();

        const departmentName = String(
          employee.PhongBan ?? ""
        ).trim();

        const jobTitle = String(
          employee.ChucVu ?? ""
        ).trim();

        const phone = String(
          employee.SoDienThoai ?? ""
        ).replace(/[\s().-]/g, "");

        if (!fullName) {
          errors.push("Thiếu họ tên");
        }

        if (!email || !emailPattern.test(email)) {
          errors.push("Email sai định dạng");
        } else if (existingEmails.has(email)) {
          errors.push(
            "Email đã tồn tại trong hệ thống"
          );
        } else if (seenEmails.has(email)) {
          errors.push("Email bị trùng trong tệp");
        } else {
          seenEmails.add(email);
        }

        if (!departmentName) {
          errors.push("Thiếu phòng ban");
        } else if (
          !departmentNames.has(
            departmentName.toLowerCase()
          )
        ) {
          errors.push(
            "Phòng ban chưa tồn tại trong hệ thống"
          );
        }

        if (!jobTitle) {
          errors.push("Thiếu chức vụ");
        }

        if (!phone || !phonePattern.test(phone)) {
          errors.push(
            "Số điện thoại không hợp lệ"
          );
        }

        return {
          rowNumber,
          HoTen: employee.HoTen,
          Email: employee.Email,
          PhongBan: employee.PhongBan,
          ChucVu: employee.ChucVu,
          SoDienThoai: employee.SoDienThoai,
          errors,
          isValid: errors.length === 0,
        };
      }
    );

    const validCount = rows.filter(
      (row: any) => row.isValid
    ).length;

    successResponse(
      res,
      {
        total: rows.length,
        validCount,
        invalidCount:
          rows.length - validCount,
        rows,
      },
      200
    );
  }

  static async importUsers(
    req: Request,
    res: Response
  ): Promise<void> {
    const user = req.user!;

    if (!UserPolicy.canManageUsers(user)) {
      errorResponse(
        res,
        "Bạn không có quyền nhập danh sách nhân sự.",
        403,
        "FORBIDDEN_ROLE"
      );
      return;
    }

    const { employees } = req.body;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const phonePattern =
      /^(?:\+?84|0)(?:3|5|7|8|9)\d{8}$/;

    const existingUsers =
      await prisma.user.findMany({
        select: {
          email: true,
        },
      });

    const existingEmails = new Set(
      existingUsers.map((item) =>
        item.email.toLowerCase()
      )
    );

    const departments =
      await prisma.department.findMany({
        select: {
          id: true,
          name: true,
        },
      });

    const departmentMap = new Map(
      departments.map((item) => [
        item.name.trim().toLowerCase(),
        item,
      ])
    );

    const seenEmails = new Set<string>();

    const createdUsers: Array<{
      id: string;
      email: string;
      fullName: string;
      departmentId: string | null;
    }> = [];

    const failedRows: Array<{
      rowNumber: number;
      email: string;
      errors: string[];
    }> = [];

    for (
      let index = 0;
      index < employees.length;
      index++
    ) {
      const employee = employees[index];

      const rowNumber =
        employee.rowNumber ?? index + 2;

      const errors: string[] = [];

      const fullName = String(
        employee.HoTen ?? ""
      ).trim();

      const email = String(
        employee.Email ?? ""
      )
        .trim()
        .toLowerCase();

      const departmentName = String(
        employee.PhongBan ?? ""
      ).trim();

      const jobTitle = String(
        employee.ChucVu ?? ""
      ).trim();

      const phone = String(
        employee.SoDienThoai ?? ""
      ).replace(/[\s().-]/g, "");

      if (!fullName) {
        errors.push("Thiếu họ tên");
      }

      if (!email || !emailPattern.test(email)) {
        errors.push("Email sai định dạng");
      } else if (existingEmails.has(email)) {
        errors.push(
          "Email đã tồn tại trong hệ thống"
        );
      } else if (seenEmails.has(email)) {
        errors.push("Email bị trùng trong tệp");
      }

      const department = departmentMap.get(
        departmentName.toLowerCase()
      );

      if (!departmentName) {
        errors.push("Thiếu phòng ban");
      } else if (!department) {
        errors.push(
          "Phòng ban chưa tồn tại trong hệ thống"
        );
      }

      if (!jobTitle) {
        errors.push("Thiếu chức vụ");
      }

      if (!phone || !phonePattern.test(phone)) {
        errors.push(
          "Số điện thoại không hợp lệ"
        );
      }

      if (errors.length > 0) {
        failedRows.push({
          rowNumber,
          email,
          errors,
        });

        continue;
      }

      seenEmails.add(email);

      try {
        const temporaryPassword =
          `${randomUUID()}Aa1!`;

        const passwordHash =
          await hashPassword(
            temporaryPassword
          );

        const newUser =
          await prisma.user.create({
            data: {
              email,
              passwordHash,
              fullName,
              departmentId: department!.id,
              isActive: true,
            },
            select: {
              id: true,
              email: true,
              fullName: true,
              departmentId: true,
            },
          });

        existingEmails.add(email);
        createdUsers.push(newUser);
      } catch {
        failedRows.push({
          rowNumber,
          email,
          errors: [
            "Không thể tạo tài khoản trong cơ sở dữ liệu",
          ],
        });
      }
    }

    if (createdUsers.length > 0) {
      await recordRequestAudit(
        req,
        AuditAction.USER_BULK_IMPORTED,
        "user",
        undefined,
        {
          totalCount: employees.length,
          createdCount:
            createdUsers.length,
          skippedCount:
            failedRows.length,
        }
      );
    }

    successResponse(
      res,
      {
        total: employees.length,
        created: createdUsers.length,
        skipped: failedRows.length,
        errors: failedRows,
        createdUsers,
      },
      200,
      `Đã nhập thành công ${createdUsers.length}/${employees.length} tài khoản.`
    );
  }
}