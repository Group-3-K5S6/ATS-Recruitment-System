import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { errorResponse, successResponse } from '../../utils/response';

const categoryCodes = ['nguonUngVien', 'lyDoLoai', 'diaDiem', 'hinhThuc'] as const;
export const createCategorySchema = z.object({
  category: z.enum(categoryCodes),
  name: z.string().trim().min(1).max(150),
});
export const updateCategorySchema = z.object({ name: z.string().trim().min(1).max(150) });
export const reorderCategoriesSchema = z.object({
  category: z.enum(categoryCodes),
  ids: z.array(z.string().uuid()).min(1),
});

async function isReferenced(category: string, name: string): Promise<boolean> {
  // Job.location is the existing live reference. Other Sprint 2 category consumers
  // are not present in the database yet and must be wired when those modules ship.
  if (category === 'diaDiem') {
    return (await prisma.job.count({ where: { location: name } })) > 0;
  }
  return false;
}

export class SharedCategoryController {
  static async list(_req: Request, res: Response): Promise<void> {
    const records = await prisma.recruitmentCategory.findMany({
      orderBy: [{ category: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });
    const data = await Promise.all(records.map(async value => ({
      id: value.id, category: value.category, name: value.name,
      position: value.position, isReferenced: await isReferenced(value.category, value.name),
    })));
    successResponse(res, data);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const { category, name } = req.body as z.infer<typeof createCategorySchema>;
    const existing = await prisma.recruitmentCategory.findFirst({ where: { category, name } });
    if (existing) {
      errorResponse(res, 'Giá trị này đã tồn tại trong danh mục.', 409, 'CATEGORY_EXISTS');
      return;
    }
    const max = await prisma.recruitmentCategory.aggregate({
      where: { category }, _max: { position: true },
    });
    const item = await prisma.recruitmentCategory.create({
      data: { category, name, position: (max._max.position ?? -1) + 1 },
    });
    successResponse(res, { ...item, isReferenced: false }, 201, 'Đã tạo giá trị danh mục.');
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const item = await prisma.recruitmentCategory.findUnique({ where: { id } });
    if (!item) { errorResponse(res, 'Không tìm thấy giá trị danh mục.', 404, 'NOT_FOUND'); return; }
    const { name } = req.body as z.infer<typeof updateCategorySchema>;
    const referenced = await isReferenced(item.category, item.name);
    // Renaming referenced values would break string-based references in Job.location.
    if (referenced && name !== item.name) {
      errorResponse(res, 'Không thể đổi tên giá trị đang được tham chiếu.', 409, 'CATEGORY_REFERENCED');
      return;
    }
    const collision = await prisma.recruitmentCategory.findFirst({
      where: { category: item.category, name, NOT: { id } },
    });
    if (collision) { errorResponse(res, 'Giá trị này đã tồn tại trong danh mục.', 409, 'CATEGORY_EXISTS'); return; }
    const updated = await prisma.recruitmentCategory.update({ where: { id }, data: { name } });
    successResponse(res, { ...updated, isReferenced: referenced }, 200, 'Đã cập nhật giá trị danh mục.');
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const item = await prisma.recruitmentCategory.findUnique({ where: { id } });
    if (!item) { errorResponse(res, 'Không tìm thấy giá trị danh mục.', 404, 'NOT_FOUND'); return; }
    if (await isReferenced(item.category, item.name)) {
      errorResponse(res, 'Không thể xóa giá trị đang được tham chiếu.', 409, 'CATEGORY_REFERENCED');
      return;
    }
    await prisma.recruitmentCategory.delete({ where: { id } });
    successResponse(res, { id }, 200, 'Đã xóa giá trị danh mục.');
  }

  static async reorder(req: Request, res: Response): Promise<void> {
    const { category, ids } = req.body as z.infer<typeof reorderCategoriesSchema>;
    if (new Set(ids).size !== ids.length) {
      errorResponse(res, 'Danh sách sắp xếp có phần tử trùng.', 400, 'INVALID_ORDER');
      return;
    }
    const current = await prisma.recruitmentCategory.findMany({
      where: { category }, select: { id: true },
    });
    if (current.length !== ids.length || current.some(item => !ids.includes(item.id))) {
      errorResponse(res, 'Danh sách sắp xếp không khớp các giá trị hiện tại.', 400, 'INVALID_ORDER');
      return;
    }
    await prisma.$transaction(ids.map((id, position) =>
      prisma.recruitmentCategory.update({ where: { id }, data: { position } })));
    successResponse(res, { ids }, 200, 'Đã cập nhật thứ tự hiển thị.');
  }
}
