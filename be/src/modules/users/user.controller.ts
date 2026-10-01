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

export const importEmployeeRowSchema = z.object({
  HoTen: z.string().optional().default(''),
  Email: z.string().optional().default(''),
  PhongBan: z.string().optional().default(''),
  ChucVu: z.string().optional().default(''),
  SoDienThoai: z.string().optional().default(''),
  rowNumber: z.number().optional(),
});

export const importPayloadSchema = z.object({
  employees: z.array(importEmployeeRowSchema),
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


  /*
   * =========================================
   * S2-01 - TẢI FILE MẪU NHẬP NHÂN SỰ
   * =========================================
   */
  static async downloadTemplate(
    _req: Request,
    res: Response
  ): Promise<void> {
    const csvHeader = '\uFEFFHoTen,Email,PhongBan,ChucVu,SoDienThoai\n';
    const sampleRows = [
      'Nguyễn Minh Anh,minh.anh@ats.vn,Nhân sự,Chuyên viên tuyển dụng,0912345678',
      'Trần Quốc Bảo,bao.tran@ats.vn,Công nghệ thông tin,Kỹ sư phần mềm,0987654321',
      'Phạm Đức Long,long.pham@ats.vn,Kinh doanh,Trưởng nhóm kinh doanh,0324567890',
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="mau-nhap-nhan-su.csv"'
    );
    res.status(200).send(csvHeader + sampleRows);
  }


  /*
   * =========================================
   * S2-01 - XEM TRƯỚC VÀ KIỂM TRA DỮ LIỆU DÒNG
   * =========================================
   */
  static async previewImport(
    req: Request,
    res: Response
  ): Promise<void> {
    const { employees } = req.body;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const phonePattern = /^(?:\+?84|0)(?:3|5|7|8|9)\d{8}$/;

    const existingUsers = await prisma.user.findMany({
      select: { email: true },
    });
    const existingEmails = new Set(
      existingUsers.map((u) => u.email.toLowerCase())
    );

    const seenEmailsInFile = new Set<string>();

    const rowsResult = (employees || []).map((emp: any, idx: number) => {
      const rowNum = emp.rowNumber || idx + 2;
      const errors: string[] = [];

      const hoTen = (emp.HoTen || '').trim();
      const email = (emp.Email || '').trim().toLowerCase();
      const phongBan = (emp.PhongBan || '').trim();
      const chucVu = (emp.ChucVu || '').trim();
      const phone = (emp.SoDienThoai || '').replace(/[\s().-]/g, '');

      if (!hoTen) errors.push('Thiếu họ tên');
      if (!email || !emailPattern.test(email)) {
        errors.push('Email sai định dạng');
      } else if (existingEmails.has(email)) {
        errors.push('Email đã tồn tại trong hệ thống');
      } else if (seenEmailsInFile.has(email)) {
        errors.push('Email bị trùng lặp trong tệp');
      } else {
        seenEmailsInFile.add(email);
      }

      if (!phongBan) errors.push('Thiếu phòng ban');
      if (!chucVu) errors.push('Thiếu chức vụ');
      if (!phone || !phonePattern.test(phone)) {
        errors.push('SĐT không hợp lệ');
      }

      return {
        rowNumber: rowNum,
        HoTen: emp.HoTen,
        Email: emp.Email,
        PhongBan: emp.PhongBan,
        ChucVu: emp.ChucVu,
        SoDienThoai: emp.SoDienThoai,
        errors,
        isValid: errors.length === 0,
      };
    });

    const validCount = rowsResult.filter((r: any) => r.isValid).length;
    const invalidCount = rowsResult.length - validCount;

    successResponse(
      res,
      {
        total: rowsResult.length,
        validCount,
        invalidCount,
        rows: rowsResult,
      },
      200
    );
  }


  /*
   * =========================================
   * S2-01 - NHẬP DANH SÁCH NHÂN SỰ HÀNG LOẠT
   * =========================================
   * Lỗi dòng bị bỏ qua, hợp lệ dòng vẫn được nhập, có báo cáo tổng hợp.
   */
  static async importUsers(
    req: Request,
    res: Response
  ): Promise<void> {
    const user = req.user!;

    if (!UserPolicy.canManageUsers(user)) {
      errorResponse(
        res,
        'Access denied. Only Admins can import user accounts.',
        403,
        'FORBIDDEN_ROLE'
      );
      return;
    }

    const { employees } = req.body;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const phonePattern = /^(?:\+?84|0)(?:3|5|7|8|9)\d{8}$/;

    const dbRoles = await prisma.role.findMany();
    const defaultRole =
      dbRoles.find((r) => r.name === RoleType.INTERVIEWER) || dbRoles[0];

    const defaultPasswordHash = await hashPassword('123456a@');

    const createdUsers: any[] = [];
    const failedRows: any[] = [];

    const existingUsers = await prisma.user.findMany({
      select: { email: true },
    });
    const existingEmails = new Set(
      existingUsers.map((u) => u.email.toLowerCase())
    );

    const empList = employees || [];
    for (let idx = 0; idx < empList.length; idx++) {
      const emp = empList[idx];
      const rowNum = emp.rowNumber || idx + 2;
      const errors: string[] = [];

      const hoTen = (emp.HoTen || '').trim();
      const email = (emp.Email || '').trim().toLowerCase();
      const phongBan = (emp.PhongBan || '').trim();
      const chucVu = (emp.ChucVu || '').trim();
      const phone = (emp.SoDienThoai || '').replace(/[\s().-]/g, '');

      if (!hoTen) errors.push('Thiếu họ tên');
      if (!email || !emailPattern.test(email)) {
        errors.push('Email sai định dạng');
      } else if (existingEmails.has(email)) {
        errors.push('Email đã tồn tại trong hệ thống');
      }

      if (!phongBan) errors.push('Thiếu phòng ban');
      if (!chucVu) errors.push('Thiếu chức vụ');
      if (!phone || !phonePattern.test(phone)) {
        errors.push('SĐT không hợp lệ');
      }

      if (errors.length > 0) {
        failedRows.push({
          rowNumber: rowNum,
          email: emp.Email || '',
          errors,
        });
        continue;
      }

      try {
        let department = await prisma.department.findFirst({
          where: { name: phongBan },
        });

        if (!department) {
          const deptCode = `DEPT_${Date.now()}_${Math.floor(
            Math.random() * 1000
          )}`;
          department = await prisma.department.create({
            data: {
              name: phongBan,
              code: deptCode,
            },
          });
        }

        let roleId = defaultRole?.id;
        const matchedRole = dbRoles.find(
          (r) =>
            r.name.toLowerCase() === chucVu.toLowerCase() ||
            r.description.toLowerCase().includes(chucVu.toLowerCase())
        );
        if (matchedRole) {
          roleId = matchedRole.id;
        }

        const newUser = await prisma.user.create({
          data: {
            email,
            passwordHash: defaultPasswordHash,
            fullName: hoTen,
            departmentId: department.id,
            isActive: true,
            roles: roleId
              ? {
                  create: [{ roleId }],
                }
              : undefined,
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

        existingEmails.add(email);
        createdUsers.push(newUser);
      } catch (err: any) {
        failedRows.push({
          rowNumber: rowNum,
          email,
          errors: [err.message || 'Lỗi tạo tài khoản'],
        });
      }
    }

    if (createdUsers.length > 0) {
      await recordRequestAudit(
        req,
        AuditAction.USER_BULK_IMPORTED,
        'user',
        undefined,
        {
          totalCount: empList.length,
          createdCount: createdUsers.length,
          skippedCount: failedRows.length,
        }
      );
    }

    successResponse(
      res,
      {
        total: empList.length,
        created: createdUsers.length,
        skipped: failedRows.length,
        errors: failedRows,
        createdUsers,
      },
      200,
      `Nhập thành công ${createdUsers.length}/${empList.length} tài khoản.`
    );
  }
}