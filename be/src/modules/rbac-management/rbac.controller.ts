import { Request, Response } from "express";
import { z } from "zod";

import { prisma } from "../../database/prisma";
import {
  successResponse,
  errorResponse,
} from "../../utils/response";

import { RoleType } from "../../rbac/roles";

/* =========================================================
   VALIDATION
========================================================= */

export const createPermissionSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Mã quyền không được để trống.")
    .max(100, "Mã quyền không được vượt quá 100 ký tự.")
    .regex(
      /^[a-z0-9_-]+:[a-z0-9_-]+$/,
      "Mã quyền phải có dạng module:action, ví dụ candidates:export.",
    )
    .transform((value) => value.toLowerCase()),

  module: z
    .string()
    .trim()
    .min(2, "Nhóm chức năng không được để trống.")
    .max(50)
    .transform((value) => value.toLowerCase()),

  description: z
    .string()
    .trim()
    .min(3, "Tên hoặc mô tả quyền phải có ít nhất 3 ký tự.")
    .max(255),
});

export const updateRolePermissionsSchema = z.object({
  permissionIds: z
    .array(z.string().uuid())
    .transform((ids) => Array.from(new Set(ids))),
});

/* =========================================================
   CONTROLLER
========================================================= */

export class RbacManagementController {
  /* =======================================================
     DANH SÁCH ROLE + QUYỀN CỦA TỪNG ROLE
  ======================================================= */

  static async listRoles(
    _req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const roles = await prisma.role.findMany({
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },

        orderBy: {
          name: "asc",
        },
      });

      const data = roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,

        isSystemAdmin:
          role.name === RoleType.ADMIN,

        permissions: role.permissions.map((rp) => ({
          id: rp.permission.id,
          code: rp.permission.code,
          module: rp.permission.module,
          description: rp.permission.description,
        })),
      }));

      successResponse(res, data, 200);
    } catch (error) {
      console.error(
        "Lỗi lấy danh sách vai trò:",
        error,
      );

      errorResponse(
        res,
        "Không thể tải danh sách vai trò.",
        500,
        "ROLE_LIST_FAILED",
      );
    }
  }

  /* =======================================================
     DANH SÁCH TẤT CẢ QUYỀN
  ======================================================= */

  static async listPermissions(
    _req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const permissions =
        await prisma.permission.findMany({
          orderBy: [
            {
              module: "asc",
            },
            {
              code: "asc",
            },
          ],
        });

      successResponse(
        res,
        permissions,
        200,
      );
    } catch (error) {
      console.error(
        "Lỗi lấy danh sách quyền:",
        error,
      );

      errorResponse(
        res,
        "Không thể tải danh sách quyền.",
        500,
        "PERMISSION_LIST_FAILED",
      );
    }
  }

  /* =======================================================
     TẠO QUYỀN MỚI
  ======================================================= */

  static async createPermission(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const {
        code,
        module,
        description,
      } = req.body;

      const existing =
        await prisma.permission.findUnique({
          where: {
            code,
          },
        });

      if (existing) {
        errorResponse(
          res,
          "Mã quyền này đã tồn tại trong hệ thống.",
          409,
          "PERMISSION_EXISTS",
        );
        return;
      }

      const permission =
        await prisma.permission.create({
          data: {
            code,
            module,
            description,
          },
        });

      successResponse(
        res,
        permission,
        201,
        "Tạo quyền mới thành công.",
      );
    } catch (error) {
      console.error(
        "Lỗi tạo quyền:",
        error,
      );

      errorResponse(
        res,
        "Không thể tạo quyền mới.",
        500,
        "PERMISSION_CREATE_FAILED",
      );
    }
  }

  /* =======================================================
     CẤP / THU HỒI QUYỀN CỦA ROLE
  ======================================================= */

  static async updateRolePermissions(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const { roleId } = req.params;

      const {
        permissionIds,
      } = req.body as {
        permissionIds: string[];
      };

      const role =
        await prisma.role.findUnique({
          where: {
            id: roleId,
          },
        });

      if (!role) {
        errorResponse(
          res,
          "Không tìm thấy vai trò.",
          404,
          "ROLE_NOT_FOUND",
        );
        return;
      }

      /*
       * ADMIN được hệ thống thiết kế là toàn quyền.
       * Không cho sửa ma trận của ADMIN để tránh
       * giao diện hiển thị sai bản chất bảo mật.
       */
      if (role.name === RoleType.ADMIN) {
        errorResponse(
          res,
          "Vai trò Quản trị hệ thống có toàn quyền cố định và không thể chỉnh sửa.",
          400,
          "ADMIN_PERMISSIONS_LOCKED",
        );
        return;
      }

      const permissions =
        await prisma.permission.findMany({
          where: {
            id: {
              in: permissionIds,
            },
          },
        });

      if (
        permissions.length !==
        permissionIds.length
      ) {
        errorResponse(
          res,
          "Danh sách quyền chứa quyền không tồn tại.",
          400,
          "INVALID_PERMISSION",
        );
        return;
      }

      /*
       * Xóa ma trận cũ và ghi lại ma trận mới
       * trong cùng một transaction.
       */
      await prisma.$transaction(
        async (tx) => {
          await tx.rolePermission.deleteMany({
            where: {
              roleId,
            },
          });

          if (permissionIds.length > 0) {
            await tx.rolePermission.createMany({
              data: permissionIds.map(
                (permissionId) => ({
                  roleId,
                  permissionId,
                }),
              ),
            });
          }
        },
      );

      const updatedRole =
        await prisma.role.findUnique({
          where: {
            id: roleId,
          },

          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        });

      successResponse(
        res,
        updatedRole,
        200,
        "Cập nhật phân quyền thành công.",
      );
    } catch (error) {
      console.error(
        "Lỗi cập nhật quyền cho vai trò:",
        error,
      );

      errorResponse(
        res,
        "Không thể cập nhật phân quyền.",
        500,
        "ROLE_PERMISSION_UPDATE_FAILED",
      );
    }
  }
}