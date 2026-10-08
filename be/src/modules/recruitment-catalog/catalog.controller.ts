import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { errorResponse, successResponse } from '../../utils/response';
import { RoleType } from '../../rbac/roles';

const categories = ['SOURCE', 'REJECTION_REASON'] as const;
const createSchema = z.object({
  category: z.enum(categories),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional().nullable(),
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(300).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export class RecruitmentCatalogController {
  static async list(req: Request, res: Response) {
    const category = req.query.category?.toString();
    if (category && !categories.includes(category as typeof categories[number])) {
      return errorResponse(res, 'Danh mục không hợp lệ.', 400, 'INVALID_CATEGORY');
    }
    const canManageInactive = req.user?.roles.some(role => role === RoleType.HR_MANAGER || role === RoleType.ADMIN);
    const items = await prisma.recruitmentCatalogItem.findMany({
      where: { ...(category ? { category } : {}), ...(canManageInactive ? {} : { isActive: true }) },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return successResponse(res, items);
  }

  static async create(req: Request, res: Response) {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return errorResponse(res, parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.', 400, 'VALIDATION_ERROR');
    try {
      const item = await prisma.recruitmentCatalogItem.create({ data: parsed.data });
      return successResponse(res, item, 201, 'Đã thêm danh mục.');
    } catch (error: any) {
      if (error?.code === 'P2002') return errorResponse(res, 'Tên này đã có trong danh mục.', 409, 'DUPLICATE_CATALOG_ITEM');
      throw error;
    }
  }

  static async update(req: Request, res: Response) {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return errorResponse(res, parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.', 400, 'VALIDATION_ERROR');
    try {
      const item = await prisma.recruitmentCatalogItem.update({ where: { id: req.params.id }, data: parsed.data });
      return successResponse(res, item, 200, 'Đã cập nhật danh mục.');
    } catch (error: any) {
      if (error?.code === 'P2025') return errorResponse(res, 'Không tìm thấy danh mục.', 404, 'NOT_FOUND');
      if (error?.code === 'P2002') return errorResponse(res, 'Tên này đã có trong danh mục.', 409, 'DUPLICATE_CATALOG_ITEM');
      throw error;
    }
  }

  static async archive(req: Request, res: Response) {
    try {
      const item = await prisma.recruitmentCatalogItem.update({ where: { id: req.params.id }, data: { isActive: false } });
      return successResponse(res, item, 200, 'Đã ngừng sử dụng danh mục.');
    } catch (error: any) {
      if (error?.code === 'P2025') return errorResponse(res, 'Không tìm thấy danh mục.', 404, 'NOT_FOUND');
      throw error;
    }
  }
}
