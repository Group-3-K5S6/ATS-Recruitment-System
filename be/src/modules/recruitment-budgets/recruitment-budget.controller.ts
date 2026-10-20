import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { RequisitionPolicy } from '../../policies/requisition.policy';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction, AuthenticatedUser } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { errorResponse, successResponse } from '../../utils/response';

const categories = ['job_posting', 'agency_fee', 'interview', 'assessment', 'referral', 'other'] as const;
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date phải có định dạng YYYY-MM-DD').refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value,
  'date không hợp lệ'
);
const optionalText = z.preprocess((value) => value === '' || value === null ? undefined : value, z.string().trim().max(1000).optional());

export const createRecruitmentExpenseSchema = z.object({
  category: z.enum(categories),
  amount: z.coerce.number().finite().positive(),
  date: dateString,
  vendor: optionalText,
  description: optionalText,
});

export const updateRecruitmentExpenseSchema = z.object({
  category: z.enum(categories).optional(),
  amount: z.coerce.number().finite().positive().optional(),
  date: dateString.optional(),
  vendor: optionalText,
  description: optionalText,
}).refine((value) => Object.keys(value).length > 0, 'Cần có ít nhất một trường để cập nhật');

export const upsertHeadcountBudgetSchema = z.object({
  year: z.coerce.number().int().min(2000).max(9999),
  headcount: z.coerce.number().int().min(0),
});

const expenseInclude = {
  createdBy: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.RecruitmentExpenseInclude;

function requisitionScope(user: AuthenticatedUser): Prisma.RequisitionWhereInput | null {
  if ([RoleType.ADMIN, RoleType.HR_MANAGER, RoleType.RECRUITER].some((role) => user.roles.includes(role))) return {};
  if (user.roles.includes(RoleType.HIRING_MANAGER)) {
    return { OR: [{ hiringManagerId: user.id }, ...(user.departmentId ? [{ departmentId: user.departmentId }] : [])] };
  }
  if (user.roles.includes(RoleType.APPROVER)) return { approverId: user.id };
  return null;
}

async function canManageRequisition(user: AuthenticatedUser, requisitionId: string): Promise<boolean> {
  return RequisitionPolicy.canManageExpenses(user, requisitionId);
}

export class RecruitmentBudgetController {
  static async requisitionHeadcountAvailability(req: Request, res: Response): Promise<void> {
    const { departmentId } = req.query;
    const rawYear = req.query.year;
    const year = rawYear === undefined
      ? new Date().getFullYear()
      : typeof rawYear === 'string'
        ? Number(rawYear)
        : Number.NaN;

    if (!Number.isInteger(year) || year < 2000 || year > 9999 ||
      typeof departmentId !== 'string' || !departmentId.trim()) {
      errorResponse(res, 'Phòng ban và năm cần tuyển không hợp lệ.', 400, 'VALIDATION_ERROR');
      return;
    }

    const user = req.user!;
    const hasOrganizationScope =
      user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER);
    if (
      !hasOrganizationScope &&
      (!user.roles.includes(RoleType.HIRING_MANAGER) || user.departmentId !== departmentId)
    ) {
      errorResponse(res, 'Bạn chỉ được xem chỉ tiêu headcount của phòng ban mình.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const department = await prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { id: true },
    });
    if (!department) {
      errorResponse(res, 'Không tìm thấy phòng ban đang hoạt động.', 404, 'NOT_FOUND');
      return;
    }

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const [budget, approved] = await Promise.all([
      prisma.departmentHeadcountBudget.findUnique({
        where: { departmentId_year: { departmentId, year } },
        select: { headcount: true },
      }),
      prisma.requisition.aggregate({
        where: { departmentId, status: 'APPROVED', targetDate: { gte: start, lt: end } },
        _sum: { headcount: true },
      }),
    ]);
    const approvedHeadcount = approved._sum.headcount ?? 0;
    const allocatedHeadcount = budget?.headcount ?? null;

    successResponse(res, {
      departmentId,
      year,
      allocatedHeadcount,
      approvedHeadcount,
      remainingHeadcount: allocatedHeadcount === null ? null : allocatedHeadcount - approvedHeadcount,
    });
  }

  static async headcountBudgets(req: Request, res: Response): Promise<void> {
    if (![RoleType.ADMIN, RoleType.HR_MANAGER, RoleType.RECRUITER].some((role) => req.user!.roles.includes(role))) {
      errorResponse(res, 'Bạn không có quyền xem chỉ tiêu headcount toàn công ty.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    const year = typeof req.query.year === 'string' ? Number(req.query.year) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      errorResponse(res, 'year phải là năm hợp lệ (YYYY).', 400, 'VALIDATION_ERROR');
      return;
    }

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const [departments, budgets, approved] = await Promise.all([
      prisma.department.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.departmentHeadcountBudget.findMany({ where: { year }, select: { departmentId: true, headcount: true } }),
      prisma.requisition.findMany({
        where: { status: 'APPROVED', targetDate: { gte: start, lt: end } },
        select: { departmentId: true, headcount: true },
      }),
    ]);
    const budgetByDepartment = new Map(budgets.map((item) => [item.departmentId, item.headcount]));
    const approvedByDepartment = new Map<string, number>();
    for (const item of approved) approvedByDepartment.set(item.departmentId, (approvedByDepartment.get(item.departmentId) ?? 0) + item.headcount);

    successResponse(res, departments.map((department) => {
      const approvedHeadcount = approvedByDepartment.get(department.id) ?? 0;
      const allocatedHeadcount = budgetByDepartment.get(department.id) ?? null;
      return {
        department,
        year,
        allocatedHeadcount,
        approvedHeadcount,
        remainingHeadcount: allocatedHeadcount === null ? null : allocatedHeadcount - approvedHeadcount,
      };
    }));
  }

  static async upsertHeadcountBudget(req: Request, res: Response): Promise<void> {
    if (![RoleType.ADMIN, RoleType.HR_MANAGER].some((role) => req.user!.roles.includes(role))) {
      errorResponse(res, 'Chỉ Trưởng phòng Nhân sự hoặc Admin được thiết lập chỉ tiêu headcount.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    const { departmentId } = req.params;
    const { year, headcount } = req.body;
    const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!department) {
      errorResponse(res, 'Không tìm thấy phòng ban.', 404, 'NOT_FOUND');
      return;
    }
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const approved = await prisma.requisition.aggregate({
      where: { departmentId, status: 'APPROVED', targetDate: { gte: start, lt: end } },
      _sum: { headcount: true },
    });
    const approvedHeadcount = approved._sum.headcount ?? 0;
    if (headcount < approvedHeadcount) {
      errorResponse(res, `Chỉ tiêu không thể thấp hơn ${approvedHeadcount} headcount đã duyệt trong năm ${year}.`, 409, 'HEADCOUNT_BUDGET_BELOW_APPROVED');
      return;
    }

    const budget = await prisma.departmentHeadcountBudget.upsert({
      where: { departmentId_year: { departmentId, year } },
      update: { headcount },
      create: { departmentId, year, headcount },
      include: { department: { select: { id: true, code: true, name: true } } },
    });
    successResponse(res, { ...budget, approvedHeadcount, remainingHeadcount: headcount - approvedHeadcount }, 200, 'Đã cập nhật chỉ tiêu headcount.');
  }

  static async list(req: Request, res: Response): Promise<void> {
    const scope = requisitionScope(req.user!);
    if (scope === null) {
      errorResponse(res, 'Bạn không có quyền xem ngân sách tuyển dụng.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const requisitions = await prisma.requisition.findMany({
      where: scope,
      include: {
        department: true,
        expenses: { orderBy: { occurredAt: 'desc' }, include: expenseInclude },
      },
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, requisitions.map((item) => {
      const spent = item.expenses.reduce((sum, expense) => sum + expense.amount, 0);
      return { ...item, budgetSummary: { allocated: item.budget, spent, remaining: item.budget === null ? null : item.budget - spent } };
    }));
  }

  static async summary(req: Request, res: Response): Promise<void> {
    const month = typeof req.query.month === 'string' ? req.query.month : new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      errorResponse(res, 'month phải có định dạng YYYY-MM.', 400, 'VALIDATION_ERROR');
      return;
    }
    const scope = requisitionScope(req.user!);
    if (scope === null) {
      errorResponse(res, 'Bạn không có quyền xem báo cáo ngân sách tuyển dụng.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const requisitions = await prisma.requisition.findMany({
      where: scope,
      select: { id: true, title: true, department: { select: { id: true, name: true } }, budget: true },
    });
    const ids = requisitions.map((item) => item.id);
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const expenses = ids.length ? await prisma.recruitmentExpense.findMany({
      where: { requisitionId: { in: ids } },
      select: { requisitionId: true, category: true, amount: true, occurredAt: true },
    }) : [];

    const totalBudget = requisitions.reduce((sum, item) => sum + (item.budget ?? 0), 0);
    const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const monthlyExpenses = expenses.filter((expense) => expense.occurredAt >= start && expense.occurredAt < end);
    const spentThisMonth = monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const spentByCategory = monthlyExpenses.reduce<Record<string, number>>((totals, expense) => {
      totals[expense.category] = (totals[expense.category] ?? 0) + expense.amount;
      return totals;
    }, {});

    successResponse(res, {
      month,
      totalBudget,
      totalSpent,
      remainingBudget: totalBudget - totalSpent,
      spentThisMonth,
      spentByCategory,
      requisitions: requisitions.map((item) => {
        const spent = expenses.filter((expense) => expense.requisitionId === item.id).reduce((sum, expense) => sum + expense.amount, 0);
        return { ...item, spent, remaining: item.budget === null ? null : item.budget - spent };
      }),
    });
  }

  static async listExpenses(req: Request, res: Response): Promise<void> {
    const { requisitionId } = req.params;
    const canView = await RequisitionPolicy.canView(req.user!, requisitionId);
    if (!canView) {
      const exists = await prisma.requisition.findUnique({ where: { id: requisitionId }, select: { id: true } });
      errorResponse(res, exists ? 'Bạn không có quyền xem ngân sách của yêu cầu này.' : 'Không tìm thấy yêu cầu tuyển dụng.', exists ? 403 : 404, exists ? 'FORBIDDEN_SCOPE' : 'NOT_FOUND');
      return;
    }
    const expenses = await prisma.recruitmentExpense.findMany({
      where: { requisitionId }, include: expenseInclude, orderBy: { occurredAt: 'desc' },
    });
    successResponse(res, expenses);
  }

  static async createExpense(req: Request, res: Response): Promise<void> {
    const { requisitionId } = req.params;
    const user = req.user!;
    if (!(await canManageRequisition(user, requisitionId))) {
      const exists = await prisma.requisition.findUnique({ where: { id: requisitionId }, select: { id: true } });
      errorResponse(res, exists ? 'Bạn không có quyền ghi nhận chi phí cho yêu cầu này.' : 'Không tìm thấy yêu cầu tuyển dụng.', exists ? 403 : 404, exists ? 'FORBIDDEN_SCOPE' : 'NOT_FOUND');
      return;
    }
    const expense = await prisma.recruitmentExpense.create({
      data: {
        requisitionId,
        category: req.body.category,
        amount: req.body.amount,
        occurredAt: new Date(`${req.body.date}T00:00:00.000Z`),
        vendor: req.body.vendor,
        description: req.body.description,
        createdById: user.id,
      },
      include: expenseInclude,
    });
    await recordRequestAudit(req, AuditAction.RECRUITMENT_EXPENSE_CREATED, 'recruitment_expense', expense.id, { requisitionId, category: expense.category, amount: expense.amount });
    successResponse(res, expense, 201, 'Đã ghi nhận chi phí tuyển dụng.');
  }

  static async getExpense(req: Request, res: Response): Promise<void> {
    const expense = await prisma.recruitmentExpense.findUnique({ where: { id: req.params.expenseId }, include: expenseInclude });
    if (!expense) {
      errorResponse(res, 'Không tìm thấy khoản chi tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }
    if (!(await RequisitionPolicy.canView(req.user!, expense.requisitionId))) {
      errorResponse(res, 'Bạn không có quyền xem khoản chi tuyển dụng này.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    successResponse(res, expense);
  }

  static async updateExpense(req: Request, res: Response): Promise<void> {
    const oldExpense = await prisma.recruitmentExpense.findUnique({ where: { id: req.params.expenseId } });
    if (!oldExpense) {
      errorResponse(res, 'Không tìm thấy khoản chi tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }
    if (!(await canManageRequisition(req.user!, oldExpense.requisitionId))) {
      errorResponse(res, 'Bạn không có quyền cập nhật khoản chi tuyển dụng này.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    const { date, ...fields } = req.body;
    const expense = await prisma.recruitmentExpense.update({
      where: { id: oldExpense.id },
      data: { ...fields, ...(date ? { occurredAt: new Date(`${date}T00:00:00.000Z`) } : {}) },
      include: expenseInclude,
    });
    await recordRequestAudit(req, AuditAction.RECRUITMENT_EXPENSE_UPDATED, 'recruitment_expense', expense.id, { requisitionId: expense.requisitionId });
    successResponse(res, expense, 200, 'Đã cập nhật khoản chi tuyển dụng.');
  }

  static async deleteExpense(req: Request, res: Response): Promise<void> {
    const expense = await prisma.recruitmentExpense.findUnique({ where: { id: req.params.expenseId } });
    if (!expense) {
      errorResponse(res, 'Không tìm thấy khoản chi tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }
    if (!(await canManageRequisition(req.user!, expense.requisitionId))) {
      errorResponse(res, 'Bạn không có quyền xóa khoản chi tuyển dụng này.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    await prisma.recruitmentExpense.delete({ where: { id: expense.id } });
    await recordRequestAudit(req, AuditAction.RECRUITMENT_EXPENSE_DELETED, 'recruitment_expense', expense.id, { requisitionId: expense.requisitionId, category: expense.category, amount: expense.amount });
    successResponse(res, { id: expense.id }, 200, 'Đã xóa khoản chi tuyển dụng.');
  }
}
