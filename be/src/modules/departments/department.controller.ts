import { Request, Response } from "express";
import { z } from "zod";

import { prisma } from "../../database/prisma";
import { errorResponse, successResponse } from "../../utils/response";
import { OPEN_REQUISITION_STATUSES } from "./department.constants";

const uuid = z.string().uuid();

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(120),

  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((value) => value.toUpperCase()),

  managerId: uuid,

  parentId: uuid.nullable().optional(),
});

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),

    code: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value) => value.toUpperCase())
      .optional(),

    managerId: uuid.optional(),

    parentId: uuid.nullable().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "Cần cung cấp ít nhất một trường để cập nhật.",
  );

export const departmentStatusSchema = z.object({
  isActive: z.boolean(),
});

const departmentIdSchema = z.object({
  id: uuid,
});

function validateId(id: string, res: Response): boolean {
  const parsed = departmentIdSchema.safeParse({ id });

  if (parsed.success) {
    return true;
  }

  errorResponse(
    res,
    "Mã phòng ban không hợp lệ.",
    400,
    "VALIDATION_ERROR",
  );

  return false;
}

type DepartmentTreeNode = {
  id: string;
  name: string;
  code: string;

  parentId: string | null;

  managerId: string | null;
  manager: string;

  active: boolean;
  isActive: boolean;

  hasOpenRequisition: boolean;

  children: DepartmentTreeNode[];
};

export class DepartmentController {
  static async list(
    _req: Request,
    res: Response,
  ): Promise<void> {
    const [departments, openRequisitions] = await Promise.all([
      prisma.department.findMany({
        include: {
          manager: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      }),

      prisma.requisition.findMany({
        where: {
          status: {
            in: [...OPEN_REQUISITION_STATUSES],
          },
        },
        select: {
          departmentId: true,
        },
      }),
    ]);

    const openDepartmentIds = new Set(
      openRequisitions.map((item) => item.departmentId),
    );

    const nodes = new Map<string, DepartmentTreeNode>();

    for (const department of departments) {
      nodes.set(department.id, {
        id: department.id,
        name: department.name,
        code: department.code,

        parentId: department.parentId,

        managerId: department.managerId,
        manager: department.manager?.fullName ?? "",

        active: department.isActive,
        isActive: department.isActive,

        hasOpenRequisition: openDepartmentIds.has(
          department.id,
        ),

        children: [],
      });
    }

    const roots: DepartmentTreeNode[] = [];

    for (const department of departments) {
      const node = nodes.get(department.id)!;

      const parent = department.parentId
        ? nodes.get(department.parentId)
        : undefined;

      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    successResponse(res, roots, 200);
  }

  static async getById(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { id } = req.params;

    if (!validateId(id, res)) {
      return;
    }

    const department =
      await prisma.department.findUnique({
        where: {
          id,
        },

        include: {
          manager: {
            select: {
              id: true,
              fullName: true,
            },
          },

          children: {
            select: {
              id: true,
              name: true,
              code: true,
              isActive: true,
              parentId: true,
            },
          },

          _count: {
            select: {
              requisitions: true,
              jobs: true,
              users: true,
            },
          },
        },
      });

    if (!department) {
      errorResponse(
        res,
        "Không tìm thấy phòng ban.",
        404,
        "NOT_FOUND",
      );

      return;
    }

    const openCount = await prisma.requisition.count({
      where: {
        departmentId: id,

        status: {
          in: [...OPEN_REQUISITION_STATUSES],
        },
      },
    });

    successResponse(
      res,
      {
        ...department,

        manager:
          department.manager?.fullName ?? "",

        active: department.isActive,

        hasOpenRequisition: openCount > 0,
      },
      200,
    );
  }

  static async create(
    req: Request,
    res: Response,
  ): Promise<void> {
    const data = createDepartmentSchema.parse(
      req.body,
    );

    const hasReferenceError =
      await DepartmentController.validateReferences(
        data,
        res,
      );

    if (hasReferenceError) {
      return;
    }

    try {
      const department =
        await prisma.department.create({
          data: {
            name: data.name,
            code: data.code,

            managerId: data.managerId,

            parentId:
              data.parentId ?? null,

            isActive: true,
          },

          include: {
            manager: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        });

      successResponse(
        res,
        {
          ...department,

          manager:
            department.manager?.fullName ?? "",

          active: department.isActive,

          hasOpenRequisition: false,

          children: [],
        },
        201,
        "Tạo phòng ban thành công.",
      );
    } catch (error) {
      if (
        (error as { code?: string }).code ===
        "P2002"
      ) {
        errorResponse(
          res,
          "Mã phòng ban đã tồn tại.",
          409,
          "DUPLICATE_DEPARTMENT_CODE",
        );

        return;
      }

      throw error;
    }
  }

  static async update(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { id } = req.params;

    if (!validateId(id, res)) {
      return;
    }

    const parsed =
      updateDepartmentSchema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      errorResponse(
        res,
        parsed.error.errors
          .map((item) => item.message)
          .join(", "),
        400,
        "VALIDATION_ERROR",
      );

      return;
    }

    const current =
      await prisma.department.findUnique({
        where: {
          id,
        },
      });

    if (!current) {
      errorResponse(
        res,
        "Không tìm thấy phòng ban.",
        404,
        "NOT_FOUND",
      );

      return;
    }

    const data = parsed.data;

    if (
      !current.managerId &&
      !data.managerId
    ) {
      errorResponse(
        res,
        "Cần gán người phụ trách cho phòng ban trước khi lưu.",
        409,
        "DEPARTMENT_MANAGER_NOT_CONFIGURED",
      );

      return;
    }

    const hasReferenceError =
      await DepartmentController.validateReferences(
        data,
        res,
        id,
        current.isActive,
      );

    if (hasReferenceError) {
      return;
    }

    try {
      const department =
        await prisma.department.update({
          where: {
            id,
          },

          data: {
            ...(data.name !== undefined
              ? {
                  name: data.name,
                }
              : {}),

            ...(data.code !== undefined
              ? {
                  code: data.code,
                }
              : {}),

            ...(data.managerId !== undefined
              ? {
                  managerId: data.managerId,
                }
              : {}),

            ...(data.parentId !== undefined
              ? {
                  parentId: data.parentId,
                }
              : {}),
          },

          include: {
            manager: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        });

      const openCount =
        await prisma.requisition.count({
          where: {
            departmentId: id,

            status: {
              in: [
                ...OPEN_REQUISITION_STATUSES,
              ],
            },
          },
        });

      successResponse(
        res,
        {
          ...department,

          manager:
            department.manager?.fullName ?? "",

          active: department.isActive,

          hasOpenRequisition:
            openCount > 0,
        },
        200,
        "Cập nhật phòng ban thành công.",
      );
    } catch (error) {
      if (
        (error as { code?: string }).code ===
        "P2002"
      ) {
        errorResponse(
          res,
          "Mã phòng ban đã tồn tại.",
          409,
          "DUPLICATE_DEPARTMENT_CODE",
        );

        return;
      }

      throw error;
    }
  }

  static async setStatus(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { id } = req.params;

    if (!validateId(id, res)) {
      return;
    }

    const parsed =
      departmentStatusSchema.safeParse(
        req.body,
      );

    if (!parsed.success) {
      errorResponse(
        res,
        "isActive phải là giá trị boolean.",
        400,
        "VALIDATION_ERROR",
      );

      return;
    }

    const department =
      await prisma.department.findUnique({
        where: {
          id,
        },
      });

    if (!department) {
      errorResponse(
        res,
        "Không tìm thấy phòng ban.",
        404,
        "NOT_FOUND",
      );

      return;
    }

    if (
      department.isActive ===
      parsed.data.isActive
    ) {
      errorResponse(
        res,
        parsed.data.isActive
          ? "Phòng ban đã hoạt động."
          : "Phòng ban đã ngừng áp dụng.",
        409,
        "NO_STATUS_CHANGE",
      );

      return;
    }

    if (
      parsed.data.isActive &&
      !department.managerId
    ) {
      errorResponse(
        res,
        "Cần gán người phụ trách trước khi kích hoạt phòng ban.",
        409,
        "DEPARTMENT_MANAGER_REQUIRED",
      );

      return;
    }

    if (
      parsed.data.isActive &&
      department.parentId
    ) {
      const parent =
        await prisma.department.findUnique({
          where: {
            id: department.parentId,
          },
        });

      if (
        parent &&
        !parent.isActive
      ) {
        errorResponse(
          res,
          "Không thể kích hoạt phòng ban khi đơn vị cấp trên đang ngừng áp dụng.",
          409,
          "INACTIVE_PARENT",
        );

        return;
      }
    }

    const updated =
      await prisma.department.update({
        where: {
          id,
        },

        data: {
          isActive:
            parsed.data.isActive,
        },
      });

    successResponse(
      res,
      {
        id: updated.id,

        active: updated.isActive,
        isActive: updated.isActive,
      },
      200,
      updated.isActive
        ? "Đã kích hoạt phòng ban."
        : "Đã ngừng áp dụng phòng ban.",
    );
  }

  static async delete(
    req: Request,
    res: Response,
  ): Promise<void> {
    const { id } = req.params;

    if (!validateId(id, res)) {
      return;
    }

    const department =
      await prisma.department.findUnique({
        where: {
          id,
        },

        include: {
          _count: {
            select: {
              children: true,
              requisitions: true,
              jobs: true,
              users: true,
            },
          },
        },
      });

    if (!department) {
      errorResponse(
        res,
        "Không tìm thấy phòng ban.",
        404,
        "NOT_FOUND",
      );

      return;
    }

    const openRequisition =
      await prisma.requisition.findFirst({
        where: {
          departmentId: id,

          status: {
            in: [
              ...OPEN_REQUISITION_STATUSES,
            ],
          },
        },

        select: {
          id: true,
        },
      });

    if (openRequisition) {
      errorResponse(
        res,
        "Phòng ban đang có yêu cầu tuyển dụng mở nên không thể xoá. Hãy ngừng áp dụng phòng ban.",
        409,
        "DEPARTMENT_HAS_OPEN_REQUISITIONS",
      );

      return;
    }

    const {
      children,
      requisitions,
      jobs,
      users,
    } = department._count;

    if (
      children ||
      requisitions ||
      jobs ||
      users
    ) {
      errorResponse(
        res,
        "Phòng ban còn đơn vị trực thuộc hoặc dữ liệu đang tham chiếu nên không thể xoá. Hãy ngừng áp dụng phòng ban.",
        409,
        "DEPARTMENT_IN_USE",
      );

      return;
    }

    await prisma.department.delete({
      where: {
        id,
      },
    });

    successResponse(
      res,
      {
        id,
      },
      200,
      "Xoá phòng ban thành công.",
    );
  }

  private static async validateReferences(
    input: {
      managerId?: string;
      parentId?: string | null;
    },
    res: Response,
    currentId?: string,
    departmentIsActive = true,
  ): Promise<boolean> {
    if (input.managerId) {
      const manager =
        await prisma.user.findUnique({
          where: {
            id: input.managerId,
          },

          select: {
            id: true,
            isActive: true,
          },
        });

      if (
        !manager ||
        !manager.isActive
      ) {
        errorResponse(
          res,
          "Người phụ trách không tồn tại hoặc đã bị khoá.",
          400,
          "INVALID_DEPARTMENT_MANAGER",
        );

        return true;
      }
    }

    if (
      input.parentId !== undefined &&
      input.parentId !== null
    ) {
      if (
        input.parentId === currentId
      ) {
        errorResponse(
          res,
          "Phòng ban không thể là đơn vị cấp trên của chính nó.",
          400,
          "DEPARTMENT_HIERARCHY_CYCLE",
        );

        return true;
      }

      const parent =
        await prisma.department.findUnique({
          where: {
            id: input.parentId,
          },

          select: {
            id: true,
            isActive: true,
            parentId: true,
          },
        });

      if (!parent) {
        errorResponse(
          res,
          "Không tìm thấy phòng ban cấp trên.",
          400,
          "INVALID_PARENT_DEPARTMENT",
        );

        return true;
      }

      if (
        departmentIsActive &&
        !parent.isActive
      ) {
        errorResponse(
          res,
          "Không thể đặt phòng ban đang hoạt động dưới một phòng ban đã ngừng áp dụng.",
          409,
          "INACTIVE_PARENT",
        );

        return true;
      }

      let ancestorId:
        | string
        | null = parent.id;

      const visited =
        new Set<string>();

      while (
        ancestorId &&
        !visited.has(ancestorId)
      ) {
        if (
          ancestorId === currentId
        ) {
          errorResponse(
            res,
            "Thay đổi này tạo vòng lặp trong sơ đồ tổ chức.",
            400,
            "DEPARTMENT_HIERARCHY_CYCLE",
          );

          return true;
        }

        visited.add(ancestorId);

        const ancestor:
          | { parentId: string | null }
          | null =
          await prisma.department.findUnique({
            where: {
              id: ancestorId,
            },

            select: {
              parentId: true,
            },
          });

        ancestorId =
          ancestor?.parentId ?? null;
      }
    }

    return false;
  }
}