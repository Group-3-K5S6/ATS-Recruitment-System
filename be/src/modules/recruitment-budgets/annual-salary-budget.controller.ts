import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { RoleType } from '../../rbac/roles';
import { errorResponse, successResponse } from '../../utils/response';

const YEAR_MIN = 2000;
const YEAR_MAX = 9998;
const MAX_VND = 9223372036854775807n;

export const annualSalaryBudgetSchema = z.object({
  year: z.coerce.number().int().min(YEAR_MIN).max(YEAR_MAX),
  salaryBudget: z.string().regex(/^(0|[1-9]\d*)$/, 'Nhập số VND nguyên không âm.')
    .refine((value) => BigInt(value) <= MAX_VND, 'Vượt giới hạn số nguyên 64-bit.'),
}).strict();

export class AnnualSalaryBudgetController {
  static async list(req: Request, res: Response): Promise<void> {
    if (![RoleType.ADMIN, RoleType.HR_MANAGER, RoleType.RECRUITER].some((role) => req.user!.roles.includes(role))) {
      errorResponse(res, 'Không có quyền xem ngân sách lương theo phòng ban.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    const year = typeof req.query.year === 'string' ? Number(req.query.year) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) {
      errorResponse(res, 'Năm ngân sách không hợp lệ.', 400, 'VALIDATION_ERROR');
      return;
    }
    const [departments, budgets] = await Promise.all([
      prisma.department.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.departmentSalaryBudget.findMany({ where: { year }, select: { departmentId: true, amountVnd: true } }),
    ]);
    const byDepartment = new Map(budgets.map((b) => [b.departmentId, b.amountVnd.toString()]));
    successResponse(res, departments.map((department) => ({
      department, year, salaryBudget: byDepartment.get(department.id) ?? null,
    })));
  }

  static async upsert(req: Request, res: Response): Promise<void> {
    if (![RoleType.ADMIN, RoleType.HR_MANAGER].some((role) => req.user!.roles.includes(role))) {
      errorResponse(res, 'Chỉ Trưởng phòng Nhân sự hoặc Admin được khai báo ngân sách.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    const { departmentId } = req.params;
    const { year, salaryBudget } = req.body as { year: number; salaryBudget: string };
    const department = await prisma.department.findFirst({
      where: { id: departmentId, isActive: true }, select: { id: true, code: true, name: true },
    });
    if (!department) {
      errorResponse(res, 'Không tìm thấy phòng ban đang hoạt động.', 404, 'NOT_FOUND');
      return;
    }
    const amountVnd = BigInt(salaryBudget);
    const saved = await prisma.departmentSalaryBudget.upsert({
      where: { departmentId_year: { departmentId, year } },
      update: { amountVnd },
      create: { departmentId, year, amountVnd },
      select: { id: true, year: true, departmentId: true, amountVnd: true },
    });
    successResponse(res, {
      id: saved.id, departmentId: saved.departmentId, year: saved.year,
      department, salaryBudget: saved.amountVnd.toString(),
    }, 200, 'Đã lưu ngân sách lương theo năm.');
  }
}
