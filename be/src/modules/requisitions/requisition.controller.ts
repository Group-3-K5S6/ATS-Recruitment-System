import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { RequisitionPolicy } from '../../policies/requisition.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { ApprovalWorkflowService } from '../approval-workflows/approval-workflow.service';
import { ApprovalStepSnapshot } from '../approval-workflows/approval-workflow.types';
import { Prisma, Requisition as RequisitionRecord } from '@prisma/client';
import { CandidatePolicy } from '../../policies/candidate.policy';


const optionalText = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().trim().optional()
);

const optionalNumber = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().optional()
);

const optionalDate = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.date().optional()
);

// CSDL có thể chứa khóa String cũ không theo chuẩn UUID sau khi migrate.
// Chỉ kiểm tra định dạng đầu vào ở đây; quyền và tồn tại được kiểm tra bên dưới.
const dbRecordId = z.string().trim().min(1).max(191);

const requisitionFields = {
  title: optionalText,
  departmentId: dbRecordId.optional(),
  headcount: z.coerce.number().int().positive().optional(),
  budget: z.coerce.number().positive().optional(),
  approverId: z.string().uuid().optional(),
  jobTitleId: dbRecordId.optional(),
  reason: z.enum(['NEW', 'REPLACEMENT']).optional(),
  proposedSalaryMin: optionalNumber,
  proposedSalaryMax: optionalNumber,
  targetDate: optionalDate,
  description: optionalText,
  requirements: optionalText,
  salaryExplanation: optionalText,
  leadRecruiterId: dbRecordId.optional(),
  supportingRecruiterIds: z.array(dbRecordId).optional(),
};

export const assignRecruitersSchema = z.object({
  leadRecruiterId: dbRecordId,
  supportingRecruiterIds: z.array(dbRecordId).optional().default([]),
  notes: optionalText,
});

export const createRequisitionSchema = z.object({
  ...requisitionFields,
  isDraft: z.boolean().optional().default(false),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL']).optional(),
  recruitmentReason: optionalText,
  quantity: z.coerce.number().int().positive().optional(),
  department: optionalText,
  jobTitle: optionalText,
});

export const updateRequisitionSchema = z.object({
  ...requisitionFields,
  isDraft: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL']).optional(),
  recruitmentReason: optionalText,
  quantity: z.coerce.number().int().positive().optional(),
  department: optionalText,
  jobTitle: optionalText,
});


export const approveRequisitionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES', 'REQUEST_ADDITIONAL_INFO']).optional(),
  notes: z.string().optional(),
  comment: z.string().optional(),
  reason: z.string().optional(),
  headcountOverride: z.boolean().optional(),
  headcountOverrideReason: z.string().trim().min(1).max(1000).optional(),
});

const requisitionListQuerySchema = z.object({
  status: z.string().trim().min(1).optional(),
  departmentId: dbRecordId.optional(),
  recruiterId: dbRecordId.optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
});

function utcDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Validate the same recruiter-role and active-account rules as the assignment endpoint. */
async function validateRecruiterSelection(
  leadRecruiterId: string,
  supportingRecruiterIds: string[]
): Promise<{ message: string; code: string } | null> {
  if (supportingRecruiterIds.includes(leadRecruiterId)) {
    return {
      message: 'Nhà tuyển dụng chính không thể đồng thời là nhà tuyển dụng hỗ trợ.',
      code: 'DUPLICATE_RECRUITER',
    };
  }

  const recruiterIds = [leadRecruiterId, ...new Set(supportingRecruiterIds)];
  const users = await prisma.user.findMany({
    where: { id: { in: recruiterIds } },
    include: { roles: { include: { role: true } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const isRecruiter = (id: string): boolean => {
    const account = byId.get(id);
    return !!account && account.isActive && account.roles.some((r) => r.role.name === RoleType.RECRUITER);
  };

  if (!isRecruiter(leadRecruiterId)) {
    return {
      message: 'Nhà tuyển dụng chính không hợp lệ, bị khóa hoặc không có vai trò RECRUITER.',
      code: 'INVALID_RECRUITER',
    };
  }
  if (supportingRecruiterIds.some((id) => !isRecruiter(id))) {
    return {
      message: 'Danh sách recruiter hỗ trợ có tài khoản không tồn tại, bị khóa hoặc không đúng vai trò.',
      code: 'INVALID_SUPPORTING_RECRUITER',
    };
  }
  return null;
}

export class RequisitionController {
  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    const parsedQuery = requisitionListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      errorResponse(res, 'Tham số lọc danh sách yêu cầu tuyển dụng không hợp lệ.', 400, 'VALIDATION_ERROR', parsedQuery.error.flatten());
      return;
    }
    const { status, departmentId, recruiterId, fromDate, toDate } = parsedQuery.data;
    if (fromDate && toDate && fromDate > toDate) {
      errorResponse(res, 'fromDate phải nhỏ hơn hoặc bằng toDate.', 400, 'VALIDATION_ERROR');
      return;
    }

    const scope: Prisma.RequisitionWhereInput = {};
    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      // Full list only for roles granted organization-wide requisition visibility.
    } else if (user.roles.includes(RoleType.RECRUITER)) {
      // S3-06: preserve S3-08 filters while restricting a recruiter to assigned requisitions.
      scope.OR = [
        { leadRecruiterId: user.id },
        { supportingRecruiters: { some: { recruiterId: user.id } } },
        { hiringManagerId: user.id },
      ];
    } else if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      scope.OR = [
        { hiringManagerId: user.id },
        ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
      ];
    } else if (user.roles.includes(RoleType.APPROVER)) {
      scope.approverId = user.id;
    } else {
      errorResponse(res, 'Bạn không có quyền xem danh sách yêu cầu tuyển dụng.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const whereClause: Prisma.RequisitionWhereInput = {
      ...scope,
      ...(status ? { status } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(recruiterId ? { jobs: { some: { recruiterId } } } : {}),
      ...((fromDate || toDate)
        ? {
            createdAt: {
              ...(fromDate ? { gte: utcDay(fromDate) } : {}),
              ...(toDate ? { lt: new Date(utcDay(toDate).getTime() + 24 * 60 * 60 * 1000) } : {}),
            },
          }
        : {}),
    };

    const requisitions = await prisma.requisition.findMany({
      where: whereClause,
      include: {
        department: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true, email: true } },
        jobs: {
          select: {
            id: true,
            recruiter: { select: { id: true, fullName: true, email: true } },
          },
        },
        leadRecruiter: { select: { id: true, fullName: true, email: true } },
        supportingRecruiters: {
          include: {
            recruiter: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const result = requisitions.map((requisition) => {
      const targetUtc = requisition.targetDate
        ? Date.UTC(requisition.targetDate.getUTCFullYear(), requisition.targetDate.getUTCMonth(), requisition.targetDate.getUTCDate())
        : null;
      const daysRemaining = targetUtc === null ? null : Math.ceil((targetUtc - todayUtc) / (24 * 60 * 60 * 1000));
      const recruiters = Array.from(
        new Map(
          requisition.jobs
            .map((job) => job.recruiter)
            .filter((recruiter): recruiter is NonNullable<typeof recruiter> => recruiter !== null)
            .map((recruiter) => [recruiter.id, recruiter] as const)
        ).values()
      );

      return {
        ...requisition,
        openDate: requisition.createdAt,
        daysOpen: Math.max(0, Math.floor(
          (todayUtc - Date.UTC(
            requisition.createdAt.getUTCFullYear(),
            requisition.createdAt.getUTCMonth(),
            requisition.createdAt.getUTCDate()
          )) / (24 * 60 * 60 * 1000)
        )),
        daysRemaining,
        isOverdue: daysRemaining !== null && daysRemaining < 0 && !['REJECTED', 'CANCELLED'].includes(requisition.status),
        recruiters,
      };
    });

    successResponse(res, result, 200);
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await RequisitionPolicy.canView(user, id);
    if (!canView) {
      const exists = await prisma.requisition.findUnique({ where: { id } });
      if (exists) {
        errorResponse(
          res,
          'Bạn không có quyền xem yêu cầu tuyển dụng ngoài phạm vi được phân công.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    const requisition = await prisma.requisition.findUnique({
      where: { id },
      include: {
        department: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true, email: true } },
        leadRecruiter: { select: { id: true, fullName: true, email: true } },
        supportingRecruiters: {
          include: {
            recruiter: { select: { id: true, fullName: true, email: true } },
          },
        },
        assignmentHistory: {
          include: {
            actor: { select: { id: true, fullName: true, email: true } },
            previousLeadRecruiter: { select: { id: true, fullName: true, email: true } },
            newLeadRecruiter: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        jobs: true,
      },
    });

    successResponse(res, requisition, 200);
  }

  private static async resolveApprovalMetadata(params: {
    departmentId: string;
    effectiveSalary?: number;
    shouldResolveChain: boolean;
    isDraft: boolean;
    defaultApproverId?: string | null;
    currentWorkflowId?: string | null;
    currentWorkflowVersion?: number | null;
    currentApprovalChain?: string | null;
  }): Promise<
    | {
        success: true;
        approverId: string | null | undefined;
        workflowId: string | null | undefined;
        workflowVersion: number | null | undefined;
        chain: string | null | undefined;
      }
    | {
        success: false;
        message: string;
        code: string;
        status: number;
      }
  > {
    let resolvedApproverId = params.defaultApproverId;
    let approvalWorkflowId = params.currentWorkflowId;
    let approvalWorkflowVersion = params.currentWorkflowVersion;
    let approvalChain = params.currentApprovalChain;

    if (params.shouldResolveChain) {
      const resolved = await ApprovalWorkflowService.resolveApprovalChain(
        params.departmentId,
        params.effectiveSalary
      );

      if (resolved.matched) {
        resolvedApproverId = resolved.currentApproverId;
        approvalWorkflowId = resolved.workflowId ?? null;
        approvalWorkflowVersion = resolved.workflowVersion ?? null;
        approvalChain = JSON.stringify(resolved.steps);
      } else if (resolved.reason === 'NO_MATCHING_RANGE') {
        return {
          success: false,
          message: 'Mức lương đề xuất không phù hợp với bất kỳ dải phê duyệt nào của phòng ban.',
          code: 'NO_MATCHING_APPROVAL_RANGE',
          status: 400,
        };
      } else if (resolved.reason === 'NO_ACTIVE_APPROVER' || resolved.reason === 'EMPTY_APPROVER_LIST') {
        return {
          success: false,
          message: 'Không có người phê duyệt đang hoạt động phù hợp cho luồng phê duyệt này.',
          code: 'NO_ACTIVE_APPROVER',
          status: 400,
        };
      } else if (resolved.reason === 'NO_WORKFLOW_CONFIGURED' && !resolvedApproverId) {
        return {
          success: false,
          message: 'Phòng ban chưa có luồng phê duyệt hoạt động hoặc người phê duyệt hợp lệ.',
          code: 'NO_ACTIVE_APPROVER',
          status: 400,
        };
      }
    }

    if (!params.isDraft && resolvedApproverId && !approvalWorkflowId) {
      const manualApprover = await prisma.user.findUnique({
        where: { id: resolvedApproverId },
        select: {
          id: true,
          isActive: true,
          roles: { include: { role: { select: { name: true } } } },
        },
      });
      if (
        !manualApprover ||
        !manualApprover.isActive ||
        !manualApprover.roles.some(({ role }) => role.name === RoleType.APPROVER)
      ) {
        return {
          success: false,
          message: 'Người phê duyệt không tồn tại, không hoạt động hoặc không có vai trò phù hợp.',
          code: 'NO_ACTIVE_APPROVER',
          status: 400,
        };
      }
    }

    return {
      success: true,
      approverId: resolvedApproverId,
      workflowId: approvalWorkflowId,
      workflowVersion: approvalWorkflowVersion,
      chain: approvalChain,
    };
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    const user = req.user!;

    const isDraft = data.isDraft === true || data.status === 'DRAFT';

    // Resolve department. A draft may use the current user's department.
    const departmentId = data.departmentId || user.departmentId;
    if (!departmentId) {
      errorResponse(res, 'Department is required.', 400, 'VALIDATION_ERROR');
      return;
    }

    const canCreate = await RequisitionPolicy.canCreate(user, departmentId);
    if (!canCreate) {
      errorResponse(
        res,
        'Bạn chỉ được tạo yêu cầu tuyển dụng trong phạm vi được phân công.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    // Resolve the job title from its ID, name, or code.
    const rawJobTitle = String(data.jobTitle || data.title || '').trim();
    let jobTitleRecord = null;

    if (data.jobTitleId) {
      jobTitleRecord = await prisma.jobTitle.findUnique({
        where: { id: data.jobTitleId },
      });
    } else if (rawJobTitle) {
      jobTitleRecord = await prisma.jobTitle.findFirst({
        where: {
          OR: [
            { name: { equals: rawJobTitle } },
            { code: { equals: rawJobTitle } },
          ],
        },
      });
    }

    // Không âm thầm bỏ qua mã chức danh không tồn tại, kể cả khi lưu nháp.
    if (data.jobTitleId && !jobTitleRecord) {
      errorResponse(res, 'Chức danh đã chọn không còn tồn tại. Vui lòng chọn lại.', 400, 'INVALID_JOB_TITLE');
      return;
    }

    const title = jobTitleRecord?.name || rawJobTitle;

    // Normalize and validate the recruitment reason.
    const rawReason = String(data.reason || data.recruitmentReason || '')
      .trim()
      .toUpperCase();

    const reason =
      rawReason === 'NEW' || rawReason === 'REPLACEMENT'
        ? rawReason
        : null;

    const headcount = Number(data.headcount ?? data.quantity ?? 1);
    const salaryMin =
      data.proposedSalaryMin === undefined || data.proposedSalaryMin === ''
        ? undefined
        : Number(data.proposedSalaryMin);
    const salaryMax =
      data.proposedSalaryMax === undefined || data.proposedSalaryMax === ''
        ? undefined
        : Number(data.proposedSalaryMax);

    if (!Number.isInteger(headcount) || headcount <= 0) {
      errorResponse(res, 'Headcount must be a positive integer.', 400, 'VALIDATION_ERROR');
      return;
    }

    if (
      (salaryMin !== undefined && (!Number.isFinite(salaryMin) || salaryMin < 0)) ||
      (salaryMax !== undefined && (!Number.isFinite(salaryMax) || salaryMax < 0))
    ) {
      errorResponse(res, 'Proposed salary values must be non-negative numbers.', 400, 'VALIDATION_ERROR');
      return;
    }

    if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
      errorResponse(
        res,
        'Minimum proposed salary cannot exceed maximum proposed salary.',
        400,
        'VALIDATION_ERROR'
      );
      return;
    }

    let targetDate: Date | undefined;
    if (data.targetDate) {
      targetDate = new Date(data.targetDate);

      if (Number.isNaN(targetDate.getTime())) {
        errorResponse(res, 'Target date is invalid.', 400, 'VALIDATION_ERROR');
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const requestedDay = new Date(targetDate);
      requestedDay.setHours(0, 0, 0, 0);

      if (requestedDay < today) {
        errorResponse(res, 'Target date cannot be in the past.', 400, 'VALIDATION_ERROR');
        return;
      }
    }

    const description = String(data.description || '').trim();
    const requirements = String(data.requirements || '').trim();
    const salaryExplanation = String(data.salaryExplanation || '').trim();

    // A submitted requisition must satisfy all required business rules.
    if (!isDraft) {
      const missingFields: string[] = [];

      if (!title || title.length < 3) missingFields.push('jobTitle');
      if (!jobTitleRecord) missingFields.push('jobTitleId');
      if (!reason) missingFields.push('reason');
      if (data.headcount === undefined && data.quantity === undefined) missingFields.push('headcount');
      if (salaryMin === undefined) missingFields.push('proposedSalaryMin');
      if (salaryMax === undefined) missingFields.push('proposedSalaryMax');
      if (!targetDate) missingFields.push('targetDate');
      if (!description) missingFields.push('description');
      if (!requirements) missingFields.push('requirements');

      if (missingFields.length > 0) {
        errorResponse(
          res,
          `Missing or invalid required fields: ${missingFields.join(', ')}.`,
          400,
          'VALIDATION_ERROR'
        );
        return;
      }
    }

    // Require an explanation when the proposed salary range falls outside
    // the standard band configured for the selected job title.
    if (jobTitleRecord && salaryMin !== undefined && salaryMax !== undefined) {
      const outsideSalaryBand =
        salaryMin < jobTitleRecord.minSalary ||
        salaryMax > jobTitleRecord.maxSalary;

      if (outsideSalaryBand && !salaryExplanation) {
        errorResponse(
          res,
          'Dải lương đề xuất vượt mức chuẩn của chức danh. Vui lòng nhập giải trình.',
          400,
          'SALARY_EXPLANATION_REQUIRED'
        );
        return;
      }
    }

    const status = isDraft ? 'DRAFT' : 'PENDING_APPROVAL';

    const budget =
      data.budget !== undefined && data.budget !== ''
        ? Number(data.budget)
        : salaryMax !== undefined
          ? salaryMax * headcount
          : undefined;

    if (budget !== undefined && (!Number.isFinite(budget) || budget <= 0)) {
      errorResponse(res, 'Budget must be a positive number.', 400, 'VALIDATION_ERROR');
      return;
    }

    const effectiveSalary = salaryMax !== undefined ? salaryMax : salaryMin;
    const approvalRes = await RequisitionController.resolveApprovalMetadata({
      departmentId,
      effectiveSalary,
      shouldResolveChain: !isDraft,
      isDraft,
      defaultApproverId: data.approverId || undefined,
    });

    if (!approvalRes.success) {
      errorResponse(res, approvalRes.message, approvalRes.status, approvalRes.code);
      return;
    }

    const requestedAssignment = data.leadRecruiterId !== undefined || data.supportingRecruiterIds !== undefined;
    if (requestedAssignment && !RequisitionPolicy.canAssign(user)) {
      errorResponse(res, 'Bạn không có quyền phân công nhà tuyển dụng.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    if (data.supportingRecruiterIds?.length && !data.leadRecruiterId) {
      errorResponse(res, 'Phải chọn recruiter chính trước khi chọn người hỗ trợ.', 400, 'INVALID_RECRUITER');
      return;
    }

    const initialLeadRecruiterId: string | undefined = data.leadRecruiterId;
    const initialSupportingIds: string[] = Array.from(new Set(data.supportingRecruiterIds ?? []));
    if (initialLeadRecruiterId) {
      const issue = await validateRecruiterSelection(initialLeadRecruiterId, initialSupportingIds);
      if (issue) {
        errorResponse(res, issue.message, 400, issue.code);
        return;
      }
    }

    // Requisition, supporting assignments, and audit history must commit atomically.
    const requisition = await prisma.$transaction(async (tx) => {
      const created = await tx.requisition.create({
        data: {
          title: title || 'Bản nháp yêu cầu tuyển dụng',
          departmentId,
          hiringManagerId: user.id,
          headcount,
          budget,
          approverId: approvalRes.approverId || undefined,
          approvalWorkflowId: approvalRes.workflowId || undefined,
          approvalWorkflowVersion: approvalRes.workflowVersion || undefined,
          approvalChain: approvalRes.chain || undefined,
          jobTitleId: jobTitleRecord?.id,
          reason: reason || undefined,
          proposedSalaryMin: salaryMin,
          proposedSalaryMax: salaryMax,
          targetDate,
          description: description || undefined,
          requirements: requirements || undefined,
          salaryExplanation: salaryExplanation || undefined,
          leadRecruiterId: initialLeadRecruiterId,
          status,
        },
      });

      if (initialLeadRecruiterId) {
        if (initialSupportingIds.length > 0) {
          await tx.requisitionSupportingRecruiter.createMany({
            data: initialSupportingIds.map((recruiterId) => ({
              requisitionId: created.id,
              recruiterId,
            })),
          });
        }

        await tx.requisitionAssignmentHistory.create({
          data: {
            requisitionId: created.id,
            actorId: user.id,
            previousLeadRecruiterId: null,
            newLeadRecruiterId: initialLeadRecruiterId,
            supportingRecruiterIds: JSON.stringify(initialSupportingIds),
            action: 'ASSIGN',
            notes: 'Phân công nhà tuyển dụng khi tạo yêu cầu tuyển dụng',
          },
        });
      }
      return created;
    });

    await recordRequestAudit(
      req,
      AuditAction.REQUISITION_CREATED,
      'requisition',
      requisition.id,
      {
        title: requisition.title,
        departmentId: requisition.departmentId,
        status: requisition.status,
      }
    );

    successResponse(
      res,
      requisition,
      201,
      isDraft
        ? 'Requisition draft saved successfully.'
        : 'Requisition submitted for approval.'
    );
  }



  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;
    const data = req.body;

    const canUpdate = await RequisitionPolicy.canUpdate(user, id);
    if (!canUpdate) {
      errorResponse(
        res,
        'Bạn không có quyền sửa yêu cầu tuyển dụng ngoài phạm vi được phân công.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const existing = await prisma.requisition.findUnique({
      where: { id },
      include: { supportingRecruiters: true },
    });
    if (!existing) {
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    if (
      (data.leadRecruiterId !== undefined || data.supportingRecruiterIds !== undefined) &&
      !RequisitionPolicy.canAssign(user)
    ) {
      errorResponse(
        res,
        'Bạn không có quyền thay đổi người phụ trách yêu cầu tuyển dụng.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    if (!['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'].includes(existing.status)) {
      errorResponse(
        res,
        'Only draft, pending, or returned (changes requested) requisitions can be edited.',
        400,
        'INVALID_STATUS'
      );
      return;
    }

    if (
      data.departmentId !== undefined &&
      data.departmentId !== existing.departmentId
    ) {
      errorResponse(
        res,
        'Changing the department of an existing requisition is not allowed.',
        400,
        'VALIDATION_ERROR'
      );
      return;
    }

    const departmentId = existing.departmentId;

    const jobTitleId =
      data.jobTitleId !== undefined
        ? data.jobTitleId
        : existing.jobTitleId;

    const jobTitleRecord = jobTitleId
      ? await prisma.jobTitle.findUnique({
        where: { id: jobTitleId },
      })
      : null;

    if (jobTitleId && !jobTitleRecord) {
      errorResponse(res, 'Selected job title was not found.', 400, 'VALIDATION_ERROR');
      return;
    }


    const rawReason = String(
      data.reason ?? data.recruitmentReason ?? existing.reason ?? ''
    ).trim().toUpperCase();

    const reason =
      rawReason === 'NEW' || rawReason === 'REPLACEMENT' ? rawReason : null;

    const headcount = Number(data.headcount ?? data.quantity ?? existing.headcount);

    const salaryMin =
      data.proposedSalaryMin === undefined
        ? existing.proposedSalaryMin
        : data.proposedSalaryMin === '' || data.proposedSalaryMin === null
          ? null
          : Number(data.proposedSalaryMin);

    const salaryMax =
      data.proposedSalaryMax === undefined
        ? existing.proposedSalaryMax
        : data.proposedSalaryMax === '' || data.proposedSalaryMax === null
          ? null
          : Number(data.proposedSalaryMax);

    if (!Number.isInteger(headcount) || headcount <= 0) {
      errorResponse(res, 'Headcount must be a positive integer.', 400, 'VALIDATION_ERROR');
      return;
    }

    if (
      (salaryMin !== null && salaryMin !== undefined &&
        (!Number.isFinite(salaryMin) || salaryMin < 0)) ||
      (salaryMax !== null && salaryMax !== undefined &&
        (!Number.isFinite(salaryMax) || salaryMax < 0))
    ) {
      errorResponse(res, 'Salary values must be non-negative numbers.', 400, 'VALIDATION_ERROR');
      return;
    }

    if (
      salaryMin !== null && salaryMin !== undefined &&
      salaryMax !== null && salaryMax !== undefined &&
      salaryMin > salaryMax
    ) {
      errorResponse(res, 'Minimum salary cannot exceed maximum salary.', 400, 'VALIDATION_ERROR');
      return;
    }

    const targetDate =
      data.targetDate === undefined
        ? existing.targetDate
        : data.targetDate === '' || data.targetDate === null
          ? null
          : new Date(data.targetDate);

    if (targetDate && Number.isNaN(targetDate.getTime())) {
      errorResponse(res, 'Target date is invalid.', 400, 'VALIDATION_ERROR');
      return;
    }

    if (targetDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const requestedDay = new Date(targetDate);
      requestedDay.setHours(0, 0, 0, 0);

      if (requestedDay < today) {
        errorResponse(res, 'Target date cannot be in the past.', 400, 'VALIDATION_ERROR');
        return;
      }
    }

    const title = jobTitleRecord?.name ?? data.title ?? existing.title;
    const description = data.description ?? existing.description ?? '';
    const requirements = data.requirements ?? existing.requirements ?? '';
    const salaryExplanation =
      data.salaryExplanation ?? existing.salaryExplanation ?? '';

    const isDraft =
      data.isDraft === true ||
      data.status === 'DRAFT' ||
      (data.isDraft !== false &&
        data.status !== 'PENDING_APPROVAL' &&
        existing.status === 'DRAFT');

    if (!isDraft) {
      const missingFields: string[] = [];

      if (!title || String(title).trim().length < 3) missingFields.push('title');
      if (!jobTitleRecord) missingFields.push('jobTitleId');
      if (!reason) missingFields.push('reason');
      if (salaryMin === null || salaryMin === undefined) missingFields.push('proposedSalaryMin');
      if (salaryMax === null || salaryMax === undefined) missingFields.push('proposedSalaryMax');
      if (!targetDate) missingFields.push('targetDate');
      if (!String(description).trim()) missingFields.push('description');
      if (!String(requirements).trim()) missingFields.push('requirements');

      if (missingFields.length > 0) {
        errorResponse(
          res,
          `Missing or invalid required fields: ${missingFields.join(', ')}.`,
          400,
          'VALIDATION_ERROR'
        );
        return;
      }
    }

    if (
      jobTitleRecord &&
      salaryMin !== null && salaryMin !== undefined &&
      salaryMax !== null && salaryMax !== undefined
    ) {
      const outsideSalaryBand =
        salaryMin < jobTitleRecord.minSalary ||
        salaryMax > jobTitleRecord.maxSalary;

      if (outsideSalaryBand && !String(salaryExplanation).trim()) {
        errorResponse(
          res,
          'Dải lương đề xuất vượt mức chuẩn của chức danh. Vui lòng nhập giải trình.',
          400,
          'SALARY_EXPLANATION_REQUIRED'
        );
        return;
      }
    }

    const budget =
      data.budget === undefined
        ? existing.budget
        : data.budget === '' || data.budget === null
          ? null
          : Number(data.budget);

    if (budget !== null && budget !== undefined &&
      (!Number.isFinite(budget) || budget <= 0)) {
      errorResponse(res, 'Budget must be positive.', 400, 'VALIDATION_ERROR');
      return;
    }

    const willBePending = !isDraft && (data.status === 'PENDING_APPROVAL' || existing.status === 'DRAFT');
    const shouldResolveChain = willBePending && (!existing.approvalChain || existing.status === 'DRAFT');
    const effectiveSalary =
      salaryMax !== null && salaryMax !== undefined
        ? salaryMax
        : salaryMin !== null && salaryMin !== undefined
          ? salaryMin
          : undefined;

    const approvalRes = await RequisitionController.resolveApprovalMetadata({
      departmentId,
      effectiveSalary,
      shouldResolveChain,
      isDraft,
      defaultApproverId: data.approverId ?? existing.approverId,
      currentWorkflowId: existing.approvalWorkflowId,
      currentWorkflowVersion: existing.approvalWorkflowVersion,
      currentApprovalChain: existing.approvalChain,
    });

    if (!approvalRes.success) {
      errorResponse(res, approvalRes.message, approvalRes.status, approvalRes.code);
      return;
    }

    // S3-02: khi người tạo nộp lại hồ sơ bị yêu cầu bổ sung, khởi động lại
    // chuỗi duyệt đã chụp (snapshot), không lấy workflow mới để thay đổi hạn mức.
    // Các quyết định cũ vẫn được lưu trong requisitionApprovalHistory.
    let updatedApprovalChain = approvalRes.chain ?? null;
    let updatedApproverId = approvalRes.approverId ?? null;
    if (existing.status === 'CHANGES_REQUESTED' && !isDraft && updatedApprovalChain) {
      let steps: ApprovalStepSnapshot[];
      try {
        const parsed: unknown = JSON.parse(updatedApprovalChain);
        if (!Array.isArray(parsed) || parsed.length === 0 ||
          parsed.some((step) => !step || typeof step !== 'object' ||
            typeof step.approverId !== 'string' || !step.approverId.trim())) {
          throw new Error('Invalid approval chain');
        }
        steps = parsed as ApprovalStepSnapshot[];
      } catch {
        errorResponse(res, 'Dữ liệu chuỗi phê duyệt không hợp lệ.', 409, 'INVALID_APPROVAL_CHAIN');
        return;
      }

      const restarted = steps.map((step, index) => ({
        ...step,
        status: index === 0 ? 'PENDING' as const : 'WAITING' as const,
        decisionAt: null,
        notes: null,
      }));
      updatedApprovalChain = JSON.stringify(restarted);
      updatedApproverId = restarted[0].approverId;
    }

    const assignmentRequested = data.leadRecruiterId !== undefined || data.supportingRecruiterIds !== undefined;
    const updatedLeadRecruiterId = data.leadRecruiterId ?? existing.leadRecruiterId;
    const originalSupportingIds = existing.supportingRecruiters.map((entry) => entry.recruiterId);
    const updatedSupportingIds: string[] = Array.from(new Set<string>(data.supportingRecruiterIds ?? originalSupportingIds));
    let assignmentAction: 'ASSIGN' | 'HANDOVER' | 'UPDATE_SUPPORTING' | null = null;

    if (assignmentRequested) {
      if (!updatedLeadRecruiterId && updatedSupportingIds.length > 0) {
        errorResponse(res, 'Phải chọn recruiter chính trước khi chọn người hỗ trợ.', 400, 'INVALID_RECRUITER');
        return;
      }
      if (updatedLeadRecruiterId) {
        const issue = await validateRecruiterSelection(updatedLeadRecruiterId, updatedSupportingIds);
        if (issue) {
          errorResponse(res, issue.message, 400, issue.code);
          return;
        }
      }

      const leadChanged = updatedLeadRecruiterId !== existing.leadRecruiterId;
      const oldSet = new Set(originalSupportingIds);
      const supportChanged = oldSet.size !== updatedSupportingIds.length ||
        updatedSupportingIds.some((id) => !oldSet.has(id));
      if (leadChanged) assignmentAction = existing.leadRecruiterId ? 'HANDOVER' : 'ASSIGN';
      else if (supportChanged) assignmentAction = 'UPDATE_SUPPORTING';
    }

    // Keep generic edits and optional assignment/history updates in one transaction.
    const updated = await prisma.$transaction(async (tx) => {
      if (!(await RequisitionPolicy.canUpdate(user, id, tx))) return null;

      const saved = await tx.requisition.update({
        where: { id },
        data: {
          title: title || 'Bản nháp yêu cầu tuyển dụng',
          departmentId,
          headcount,
          budget:
            data.budget === undefined &&
              data.proposedSalaryMax !== undefined &&
              salaryMax !== null && salaryMax !== undefined
              ? salaryMax * headcount
              : budget,
          approverId: updatedApproverId,
          approvalWorkflowId: approvalRes.workflowId ?? null,
          approvalWorkflowVersion: approvalRes.workflowVersion ?? null,
          approvalChain: updatedApprovalChain,
          jobTitleId: jobTitleId ?? null,
          reason,
          proposedSalaryMin: salaryMin,
          proposedSalaryMax: salaryMax,
          targetDate,
          description: description || null,
          requirements: requirements || null,
          salaryExplanation: salaryExplanation || null,
          leadRecruiterId: updatedLeadRecruiterId,
          status: isDraft ? 'DRAFT' : 'PENDING_APPROVAL',
        },
      });

      if (assignmentAction && updatedLeadRecruiterId) {
        const originalSet = new Set(originalSupportingIds);
        const supportChanged = originalSet.size !== updatedSupportingIds.length ||
          updatedSupportingIds.some((id) => !originalSet.has(id));
        if (supportChanged) {
          await tx.requisitionSupportingRecruiter.deleteMany({ where: { requisitionId: id } });
          if (updatedSupportingIds.length > 0) {
            await tx.requisitionSupportingRecruiter.createMany({
              data: updatedSupportingIds.map((recruiterId) => ({ requisitionId: id, recruiterId })),
            });
          }
        }

        if (updatedLeadRecruiterId !== existing.leadRecruiterId) {
          await tx.job.updateMany({
            where: { requisitionId: id },
            data: { recruiterId: updatedLeadRecruiterId },
          });
        }

        await tx.requisitionAssignmentHistory.create({
          data: {
            requisitionId: id,
            actorId: user.id,
            previousLeadRecruiterId: existing.leadRecruiterId,
            newLeadRecruiterId: updatedLeadRecruiterId,
            supportingRecruiterIds: JSON.stringify(updatedSupportingIds),
            action: assignmentAction,
            notes: assignmentAction === 'HANDOVER'
              ? 'Chuyển giao người phụ trách khi cập nhật yêu cầu tuyển dụng'
              : assignmentAction === 'UPDATE_SUPPORTING'
                ? 'Cập nhật recruiter hỗ trợ khi sửa yêu cầu tuyển dụng'
                : 'Phân công tuyển dụng khi cập nhật',
          },
        });
      }
      return saved;
    });

    if (!updated) {
      errorResponse(
        res,
        'Bạn không có quyền sửa yêu cầu tuyển dụng ngoài phạm vi được phân công.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    await recordRequestAudit(
      req,
      AuditAction.REQUISITION_UPDATED,
      'requisition',
      updated.id,
      { status: updated.status }
    );

    successResponse(
      res,
      updated,
      200,
      isDraft
        ? 'Requisition draft saved successfully.'
        : 'Requisition submitted for approval.'
    );
  }

  static async approve(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    let { decision, notes, comment, reason, headcountOverride, headcountOverrideReason } = req.body;
    const user = req.user!;

    // Chuẩn hóa và lấy ý kiến/lý do
    const feedback = String(notes ?? comment ?? reason ?? '').trim();
    const overrideReason = String(headcountOverrideReason ?? '').trim();

    let normalizedDecision = String(decision || 'APPROVE').toUpperCase();
    if (normalizedDecision === 'REQUEST_ADDITIONAL_INFO') {
      normalizedDecision = 'REQUEST_CHANGES';
    }

    if (
      (headcountOverride === true || overrideReason) &&
      normalizedDecision !== 'APPROVE'
    ) {
      errorResponse(res, 'Chỉ có thể ghi đè headcount khi phê duyệt yêu cầu.', 400, 'VALIDATION_ERROR');
      return;
    }
    if (overrideReason && headcountOverride !== true) {
      errorResponse(res, 'Cần xác nhận ghi đè khi gửi lý do vượt chỉ tiêu.', 400, 'VALIDATION_ERROR');
      return;
    }
    if (headcountOverride === true && !user.roles.includes(RoleType.HR_MANAGER)) {
      errorResponse(res, 'Chỉ Trưởng phòng Nhân sự được ghi đè chỉ tiêu headcount.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    if (headcountOverride === true && !overrideReason) {
      errorResponse(res, 'Vui lòng nhập lý do khi ghi đè chỉ tiêu headcount.', 400, 'VALIDATION_ERROR');
      return;
    }

    // Tiêu chí SCRUM-37: Duyệt, Từ chối, Yêu cầu bổ sung — hai hành động sau bắt buộc nhập ý kiến
    if (normalizedDecision === 'REJECT' || normalizedDecision === 'REQUEST_CHANGES') {
      if (!feedback) {
        errorResponse(
          res,
          normalizedDecision === 'REJECT'
            ? 'Vui lòng nhập lý do/ý kiến khi từ chối yêu cầu tuyển dụng.'
            : 'Vui lòng nhập ý kiến yêu cầu bổ sung thông tin hồ sơ.',
          400,
          'VALIDATION_ERROR'
        );
        return;
      }
    }

    const canApprove = await RequisitionPolicy.canApprove(user, id);
    if (!canApprove) {
      errorResponse(
        res,
        'Bạn không được phân công phê duyệt yêu cầu tuyển dụng này.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const existing = await prisma.requisition.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    if (existing.status !== 'PENDING_APPROVAL') {
      errorResponse(
        res,
        'Chỉ có thể phê duyệt hoặc từ chối yêu cầu đang ở trạng thái chờ duyệt (PENDING_APPROVAL).',
        400,
        'INVALID_STATUS'
      );
      return;
    }

    const fromStatus = existing.status;
    let newStatus =
      normalizedDecision === 'APPROVE'
        ? 'APPROVED'
        : normalizedDecision === 'REJECT'
          ? 'REJECTED'
          : 'CHANGES_REQUESTED';
    let nextApproverId: string | null = existing.approverId;
    let updatedChainString = existing.approvalChain;
    let currentStepNumber: number | null = null;

    if (existing.approvalChain) {
      try {
        const steps: ApprovalStepSnapshot[] = JSON.parse(existing.approvalChain);
        const currentStepIndex = steps.findIndex(
          (s) =>
            s.status === 'PENDING' &&
            (s.approverId === user.id ||
              user.roles.includes(RoleType.ADMIN) ||
              user.roles.includes(RoleType.HR_MANAGER))
        );

        if (currentStepIndex === -1) {
          errorResponse(res, 'Không tìm thấy cấp phê duyệt hợp lệ đang chờ.', 409, 'NO_PENDING_APPROVAL_STEP');
          return;
        }

        if (currentStepIndex !== -1) {
          currentStepNumber = steps[currentStepIndex].step || currentStepIndex + 1;

          if (normalizedDecision === 'REJECT') {
            steps[currentStepIndex].status = 'REJECTED';
            steps[currentStepIndex].decisionAt = new Date().toISOString();
            steps[currentStepIndex].notes = feedback || null;
            newStatus = 'REJECTED';
            updatedChainString = JSON.stringify(steps);
          } else if (normalizedDecision === 'REQUEST_CHANGES') {
            steps[currentStepIndex].status = 'CHANGES_REQUESTED';
            steps[currentStepIndex].decisionAt = new Date().toISOString();
            steps[currentStepIndex].notes = feedback || null;
            newStatus = 'CHANGES_REQUESTED';
            // Yêu cầu bổ sung trả hồ sơ về cho người tạo, bảo lưu cấp duyệt đầu tiên để duyệt lại
            nextApproverId = steps[0].approverId || existing.approverId;
            updatedChainString = JSON.stringify(steps);
          } else {
            // Duyệt (APPROVE) cấp hiện tại
            steps[currentStepIndex].status = 'APPROVED';
            steps[currentStepIndex].decisionAt = new Date().toISOString();
            steps[currentStepIndex].notes = feedback || null;

            // Duyệt xong tự chuyển sang cấp kế tiếp; cấp cuối duyệt thì yêu cầu chuyển sang trạng thái Đã duyệt
            if (currentStepIndex + 1 < steps.length) {
              const nextStep = steps[currentStepIndex + 1];
              nextStep.status = 'PENDING';
              nextApproverId = nextStep.approverId;
              newStatus = 'PENDING_APPROVAL';
            } else {
              newStatus = 'APPROVED';
            }
            updatedChainString = JSON.stringify(steps);
          }
        }
      } catch {
        errorResponse(res, 'Dữ liệu chuỗi phê duyệt không hợp lệ.', 409, 'INVALID_APPROVAL_CHAIN');
        return;
      }
    }

    // Requisition khong co approval chain la duyet don cap.
    if (currentStepNumber === null) currentStepNumber = 1;
    if (headcountOverride === true && newStatus !== 'APPROVED') {
      errorResponse(res, 'Chỉ có thể ghi đè chỉ tiêu tại bước phê duyệt cuối.', 400, 'VALIDATION_ERROR');
      return;
    }

    // Loi nghiep vu ngan sach: rollback toan bo transaction.
    class ApprovalBudgetError extends Error {
      constructor(
        public readonly code: string,
        message: string,
        public readonly details?: {
          year: number;
          allocatedHeadcount: number;
          approvedHeadcount: number;
          requestedHeadcount: number;
          remainingHeadcount: number;
        },
      ) {
        super(message);
      }
    }

    type HeadcountOverrideDetails = {
      reason: string;
      year: number;
      allocatedHeadcount: number;
      approvedHeadcount: number;
      requestedHeadcount: number;
      remainingHeadcount: number;
    };
    let updated: RequisitionRecord | null = null;
    let headcountOverrideDetails: HeadcountOverrideDetails | null = null;
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const claimed = await tx.requisition.updateMany({
          where: {
            id,
            status: fromStatus,
            approverId: existing.approverId,
            approvalChain: existing.approvalChain,
          },
          data: {
            status: newStatus,
            approverId: nextApproverId,
            approvalChain: updatedChainString,
          },
        });

        if (claimed.count !== 1) return null;
        let transactionOverrideDetails: HeadcountOverrideDetails | null = null;

        // PR67: chi kiem tra headcount khi phe duyet CAP CUOI.
        // Duyet cap trung gian va tu choi khong tieu ton ngan sach.
        if (normalizedDecision === 'APPROVE' && newStatus === 'APPROVED') {
          if (!existing.targetDate) {
            throw new ApprovalBudgetError(
              'TARGET_DATE_REQUIRED',
              'Yêu cầu cần có ngày tuyển dụng để xác định năm ngân sách headcount.'
            );
          }

          const year = existing.targetDate.getUTCFullYear();
          const budget = await tx.departmentHeadcountBudget.findUnique({
            where: {
              departmentId_year: {
                departmentId: existing.departmentId,
                year,
              },
            },
            select: { headcount: true },
          });

          if (!budget) {
            throw new ApprovalBudgetError(
              'HEADCOUNT_BUDGET_NOT_CONFIGURED',
              `Phòng ban chưa được thiết lập chỉ tiêu headcount năm ${year}.`
            );
          }

          const start = new Date(Date.UTC(year, 0, 1));
          const end = new Date(Date.UTC(year + 1, 0, 1));

          const approved = await tx.requisition.aggregate({
            where: {
              departmentId: existing.departmentId,
              status: 'APPROVED',
              // Khong tinh lai headcount cua requisition dang duyet.
              id: { not: id },
              targetDate: { gte: start, lt: end },
            },
            _sum: { headcount: true },
          });

          const approvedHeadcount = approved._sum.headcount ?? 0;
          const requestedHeadcount = existing.headcount;
          const details = {
            year,
            allocatedHeadcount: budget.headcount,
            approvedHeadcount,
            requestedHeadcount,
            remainingHeadcount: budget.headcount - approvedHeadcount,
          };

          if (headcountOverride === true && approvedHeadcount + requestedHeadcount <= budget.headcount) {
            throw new ApprovalBudgetError(
              'HEADCOUNT_OVERRIDE_NOT_REQUIRED',
              'Không thể ghi đè vì yêu cầu không vượt chỉ tiêu headcount.',
              details
            );
          }

          if (approvedHeadcount + requestedHeadcount > budget.headcount) {
            if (headcountOverride !== true) {
              throw new ApprovalBudgetError(
                'HEADCOUNT_BUDGET_EXCEEDED',
                `Không thể duyệt: phòng ban đã dùng ${approvedHeadcount}/${budget.headcount} headcount năm ${year}; yêu cầu thêm ${requestedHeadcount}. Chỉ Trưởng phòng Nhân sự mới có thể ghi đè với lý do.`,
                details
              );
            }
            transactionOverrideDetails = { ...details, reason: overrideReason };
          }
        }

        const approvalNotes = [
          feedback || null,
          transactionOverrideDetails
            ? `Ghi đè chỉ tiêu headcount: ${transactionOverrideDetails.reason}`
            : null,
        ].filter((note): note is string => note !== null).join('\n') || null;

        await tx.requisitionApprovalHistory.create({
          data: {
            requisitionId: id,
            actorId: user.id,
            fromStatus,
            toStatus: newStatus,
            decision: normalizedDecision,
            step: currentStepNumber,
            notes: approvalNotes,
          },
        });

        return {
          requisition: await tx.requisition.findUniqueOrThrow({ where: { id } }),
          headcountOverrideDetails: transactionOverrideDetails,
        };
      });
      if (outcome) {
        updated = outcome.requisition;
        headcountOverrideDetails = outcome.headcountOverrideDetails;
      }
    } catch (error) {
      if (error instanceof ApprovalBudgetError) {
        errorResponse(res, error.message, 409, error.code, error.details);
        return;
      }

      const code = error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';

      if (['P2034', 'P2028', 'P1008', 'SQLITE_BUSY'].includes(code)) {
        errorResponse(res, 'Yêu cầu đã được xử lý hoặc đang được cập nhật. Vui lòng tải lại.', 409, 'APPROVAL_CONFLICT');
        return;
      }

      console.error('[Requisition] Approval failed:', error);
      errorResponse(res, 'Không thể xử lý phê duyệt.', 500, 'SERVER_ERROR');
      return;
    }

    if (!updated) {
      errorResponse(res, 'Yêu cầu đã thay đổi trạng thái. Vui lòng tải lại.', 409, 'APPROVAL_CONFLICT');
      return;
    }

    const action =
      normalizedDecision === 'APPROVE'
        ? AuditAction.REQUISITION_APPROVED
        : normalizedDecision === 'REJECT'
          ? AuditAction.REQUISITION_REJECTED
          : AuditAction.REQUISITION_CHANGES_REQUESTED;

    await recordRequestAudit(req, action, 'requisition', updated.id, {
      status: newStatus,
      fromStatus,
      toStatus: newStatus,
      decision: normalizedDecision,
      stepDecision: normalizedDecision,
      step: currentStepNumber,
      notes: [
        feedback || null,
        headcountOverrideDetails
          ? `Ghi đè chỉ tiêu headcount: ${headcountOverrideDetails.reason}`
          : null,
      ].filter((note): note is string => note !== null).join('\n') || null,
      headcountOverride: headcountOverrideDetails,
    });

    const message =
      newStatus === 'PENDING_APPROVAL'
        ? 'Cấp duyệt hiện tại đã phê duyệt thành công. Yêu cầu đã được chuyển tới cấp duyệt tiếp theo.'
        : newStatus === 'APPROVED'
          ? 'Yêu cầu tuyển dụng đã được phê duyệt.'
          : newStatus === 'REJECTED'
            ? 'Yêu cầu tuyển dụng đã bị từ chối.'
            : 'Đã yêu cầu bổ sung thông tin. Hồ sơ đã được trả về cho người tạo và lưu vết lịch sử.';

    successResponse(res, updated, 200, message);
  }

  /**
   * GET /api/requisitions/:id/approval-history
   * SCRUM-89: Trả về trạng thái hiện tại + toàn bộ lịch sử phê duyệt của một requisition.
   * Lịch sử bất biến – chỉ đọc, không cho phép sửa/xóa.
   */
  static async getApprovalHistory(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await RequisitionPolicy.canView(user, id);
    if (!canView) {
      const exists = await prisma.requisition.findUnique({ where: { id } });
      if (exists) {
        errorResponse(
          res,
          'Bạn không có quyền xem yêu cầu tuyển dụng ngoài phạm vi được phân công.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    const requisition = await prisma.requisition.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        hiringManager: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true, email: true } },
        approvalHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            actor: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });

    if (!requisition) {
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    const isTerminal = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(requisition.status);
    const isDraft = ['DRAFT', 'CHANGES_REQUESTED'].includes(requisition.status);

    let currentApprover: { id: string; fullName: string; email: string } | null = null;
    if (!isTerminal && !isDraft && requisition.approver) {
      currentApprover = requisition.approver;
    }

    const historySteps = requisition.approvalHistory.map((entry) => ({
      id: entry.id,
      decision: entry.decision,
      step: entry.step,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      actor: entry.actor,
      notes: entry.notes,
      processedAt: entry.createdAt,
    }));

    successResponse(
      res,
      {
        requisitionId: requisition.id,
        title: requisition.title,
        currentStatus: requisition.status,
        approvalChain: requisition.approvalChain,
        department: requisition.department,
        hiringManager: requisition.hiringManager,
        designatedApprover: requisition.approver,
        currentPendingApprover: currentApprover,
        totalSteps: historySteps.length,
        history: historySteps,
      },
      200
    );
  }
  /**
   * POST /api/requisitions/:id/close
   * SCRUM-99: Tạm dừng (ON_HOLD), Đóng/Hủy (CANCELLED), hoặc Đã tuyển đủ (FILLED) yêu cầu tuyển dụng.
   *
   * Body:
   *   action: 'CANCEL' | 'ON_HOLD' | 'FILLED'
   *   reason: string  (bắt buộc)
   *   force?: boolean (nếu còn ứng viên trong pipeline, mặc định false = trả cảnh báo)
   */
  static async closeRequisition(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    // --- Quyền ---
    const canClose = await RequisitionPolicy.canClose(user, id);
    if (!canClose) {
      errorResponse(
        res,
        'Bạn không có quyền tạm dừng hoặc đóng yêu cầu tuyển dụng. Chỉ Trưởng phòng Nhân sự hoặc Admin mới được thực hiện thao tác này.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    // --- Validation body ---
    const closeSchema = z.object({
      action: z.enum(['CANCEL', 'ON_HOLD', 'FILLED']),
      reason: z.string().trim().min(1, 'Lý do không được để trống.'),
      force: z.boolean().optional().default(false),
    });

    const parsed = closeSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      errorResponse(
        res,
        firstError?.message ?? 'Dữ liệu không hợp lệ.',
        400,
        'VALIDATION_ERROR'
      );
      return;
    }

    const { action, reason, force } = parsed.data;

    // --- Lấy requisition ---
    const existing = await prisma.requisition.findUnique({
      where: { id },
      include: {
        jobs: { select: { id: true, status: true } },
      },
    });

    if (!existing) {
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    // --- Kiểm tra trạng thái hợp lệ để chuyển ---
    // Trạng thái kết thúc không thể chuyển tiếp nữa.
    const TERMINAL_STATUSES = ['CANCELLED', 'FILLED'];
    if (TERMINAL_STATUSES.includes(existing.status)) {
      errorResponse(
        res,
        `Yêu cầu tuyển dụng đang ở trạng thái "${existing.status}" và không thể thay đổi thêm.`,
        400,
        'INVALID_STATUS'
      );
      return;
    }

    // ON_HOLD chỉ chuyển từ trạng thái đang hoạt động (không phải từ trạng thái kết thúc).
    if (action === 'ON_HOLD' && existing.status === 'ON_HOLD') {
      errorResponse(
        res,
        'Yêu cầu tuyển dụng đã ở trạng thái tạm dừng (ON_HOLD).',
        400,
        'INVALID_STATUS'
      );
      return;
    }

    // --- Kiểm tra ứng viên đang trong pipeline ---
    // Đếm ứng viên ACTIVE trong tất cả các job thuộc requisition này.
    const jobIds = existing.jobs.map((j) => j.id);
    let activeCandidateCount = 0;
    if (jobIds.length > 0) {
      activeCandidateCount = await prisma.application.count({
        where: {
          jobId: { in: jobIds },
          status: 'ACTIVE',
        },
      });
    }

    if (activeCandidateCount > 0 && !force) {
      // Trả cảnh báo thay vì xử lý âm thầm — người dùng phải gửi force=true để xác nhận.
      successResponse(
        res,
        {
          warning: true,
          activeCandidateCount,
          message: `Còn ${activeCandidateCount} ứng viên đang trong pipeline. Gửi lại với force=true để xác nhận thao tác. Ứng viên sẽ không bị xóa.`,
        },
        200,
        'PIPELINE_WARNING'
      );
      return;
    }

    // --- Xác định trạng thái đích ---
    const targetStatus =
      action === 'ON_HOLD' ? 'ON_HOLD' :
      action === 'FILLED' ? 'FILLED' :
      'CANCELLED';

    const fromStatus = existing.status;

    // --- Transaction: chi mot request duoc chuyen trang thai tu ban ghi da doc ---
    // CAS theo status + updatedAt tranh cap nhat de khi co thao tac dong thoi.
    // Neu mat quyen cap nhat, khong dong job va khong ghi them history.
    let updated;
    let unpublishedJobCount = 0;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const claimed = await tx.requisition.updateMany({
          where: {
            id,
            status: fromStatus,
            updatedAt: existing.updatedAt,
          },
          data: { status: targetStatus },
        });

        if (claimed.count !== 1) return null;

        // Dong cac job dang PUBLISHED trong cung transaction; khong dung
        // danh sach job lay truoc transaction (co the da thay doi).
        const closedJobs = await tx.job.updateMany({
          where: { requisitionId: id, status: 'PUBLISHED' },
          data: { status: 'CLOSED' },
        });

        await tx.requisitionApprovalHistory.create({
          data: {
            requisitionId: id,
            actorId: user.id,
            fromStatus,
            toStatus: targetStatus,
            decision: action,
            step: null,
            notes: reason,
          },
        });

        const requisition = await tx.requisition.findUniqueOrThrow({ where: { id } });
        return { requisition, unpublishedJobCount: closedJobs.count };
      });

      if (!result) {
        errorResponse(
          res,
          'Yêu cầu đã được thay đổi bởi thao tác khác. Vui lòng tải lại và thử lại.',
          409,
          'CONCURRENT_MODIFICATION'
        );
        return;
      }
      updated = result.requisition;
      unpublishedJobCount = result.unpublishedJobCount;
    } catch (error) {
      // SQLite/Prisma co the tra P2034 neu hai transaction tranh chap.
      if (
        typeof error === 'object' && error !== null &&
        'code' in error && error.code === 'P2034'
      ) {
        errorResponse(res, 'Yêu cầu đang được cập nhật. Vui lòng thử lại.', 409, 'CONCURRENT_MODIFICATION');
        return;
      }
      console.error('[Requisition] closeRequisition failed:', error);
      errorResponse(res, 'Không thể thực hiện thao tác. Vui lòng thử lại.', 500, 'SERVER_ERROR');
      return;
    }

    // --- Audit log ---
    const auditActionMap: Record<string, AuditAction> = {
      CANCEL: AuditAction.REQUISITION_CLOSED,
      ON_HOLD: AuditAction.REQUISITION_ON_HOLD,
      FILLED: AuditAction.REQUISITION_FILLED,
    };

    await recordRequestAudit(
      req,
      auditActionMap[action]!,
      'requisition',
      updated.id,
      {
        fromStatus,
        toStatus: targetStatus,
        action,
        reason,
        unpublishedJobCount,
        activeCandidateCount,
      }
    );

    const messageMap: Record<string, string> = {
      CANCEL: 'Yêu cầu tuyển dụng đã được hủy (CANCELLED).',
      ON_HOLD: 'Yêu cầu tuyển dụng đã được tạm dừng (ON_HOLD).',
      FILLED: 'Yêu cầu tuyển dụng đã được đánh dấu đã tuyển đủ (FILLED).',
    };

    successResponse(
      res,
      {
        ...updated,
        unpublishedJobCount,
        activeCandidateCount,
      },
      200,
      messageMap[action]!
    );
  }

  /**
   * SCRUM-97 / SCRUM-41: Phân công nhà tuyển dụng phụ trách (Chính & Hỗ trợ)
   * Có ghi lịch sử chuyển giao khi đổi người phụ trách
   */
  static async assignRecruiters(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { leadRecruiterId, supportingRecruiterIds = [], notes } = req.body;
    const user = req.user!;

    // 1. Phân quyền: Chỉ HR_MANAGER và ADMIN được phân công nhà tuyển dụng
    if (!RequisitionPolicy.canAssign(user)) {
      errorResponse(
        res,
        'Bạn không có quyền phân công người phụ trách yêu cầu tuyển dụng.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    // 2. Kiểm tra Requisition tồn tại
    const requisition = await prisma.requisition.findUnique({
      where: { id },
      include: {
        supportingRecruiters: true,
      },
    });

    if (!requisition) {
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    // 3. Kiểm tra nhà tuyển dụng chính
    const leadUser = await prisma.user.findUnique({
      where: { id: leadRecruiterId },
      include: { roles: { include: { role: true } } },
    });

    if (!leadUser || !leadUser.isActive || !leadUser.roles.some((r) => r.role.name === RoleType.RECRUITER)) {
      errorResponse(
        res,
        'Nhà tuyển dụng chính không hợp lệ, không hoạt động hoặc không có vai trò RECRUITER.',
        400,
        'INVALID_RECRUITER'
      );
      return;
    }

    // 4. Kiểm tra danh sách nhà tuyển dụng hỗ trợ
    const rawSupportingIds: string[] = Array.isArray(supportingRecruiterIds) ? supportingRecruiterIds : [];
    if (rawSupportingIds.includes(leadRecruiterId)) {
      errorResponse(
        res,
        'Nhà tuyển dụng chính không thể đồng thời là nhà tuyển dụng hỗ trợ.',
        400,
        'DUPLICATE_RECRUITER'
      );
      return;
    }

    const uniqueSupportingIds = Array.from(new Set(rawSupportingIds));

    if (uniqueSupportingIds.length > 0) {
      const supportingUsers = await prisma.user.findMany({
        where: {
          id: { in: uniqueSupportingIds },
        },
        include: { roles: { include: { role: true } } },
      });

      if (supportingUsers.length !== uniqueSupportingIds.length) {
        errorResponse(
          res,
          'Một hoặc nhiều nhà tuyển dụng hỗ trợ không tồn tại trong hệ thống.',
          400,
          'INVALID_SUPPORTING_RECRUITER'
        );
        return;
      }

      const invalidUser = supportingUsers.find(
        (u) => !u.isActive || !u.roles.some((r) => r.role.name === RoleType.RECRUITER)
      );

      if (invalidUser) {
        errorResponse(
          res,
          `Nhà tuyển dụng hỗ trợ "${invalidUser.fullName}" không hợp lệ, bị khóa hoặc không có vai trò RECRUITER.`,
          400,
          'INVALID_SUPPORTING_RECRUITER'
        );
        return;
      }
    }

    const previousLeadId = requisition.leadRecruiterId;
    const oldSupportIds = new Set(requisition.supportingRecruiters.map((entry) => entry.recruiterId));
    if (
      previousLeadId === leadRecruiterId &&
      oldSupportIds.size === uniqueSupportingIds.length &&
      uniqueSupportingIds.every((id) => oldSupportIds.has(id))
    ) {
      const current = await prisma.requisition.findUnique({
        where: { id },
        include: {
          department: true,
          hiringManager: { select: { id: true, fullName: true, email: true } },
          approver: { select: { id: true, fullName: true, email: true } },
          leadRecruiter: { select: { id: true, fullName: true, email: true } },
          supportingRecruiters: {
            include: { recruiter: { select: { id: true, fullName: true, email: true } } },
          },
        },
      });
      successResponse(res, current, 200, 'Phân công không thay đổi.');
      return;
    }
    const isHandover = previousLeadId !== null && previousLeadId !== leadRecruiterId;
    const action = previousLeadId === null ? 'ASSIGN' : (isHandover ? 'HANDOVER' : 'UPDATE_SUPPORTING');
    const historyNotes = notes?.trim() || (isHandover ? 'Chuyển giao người phụ trách chính' : 'Phân công tuyển dụng');

    // 5. Thực thi Transaction cập nhật Requisition, SupportingRecruiters & Ghi Lịch sử chuyển giao
    const result = await prisma.$transaction(async (tx) => {
      // Xóa danh sách hỗ trợ cũ
      await tx.requisitionSupportingRecruiter.deleteMany({
        where: { requisitionId: id },
      });

      // Tạo danh sách hỗ trợ mới
      if (uniqueSupportingIds.length > 0) {
        await tx.requisitionSupportingRecruiter.createMany({
          data: uniqueSupportingIds.map((recruiterId) => ({
            requisitionId: id,
            recruiterId,
          })),
        });
      }

      // Cập nhật người phụ trách chính
      const updatedReq = await tx.requisition.update({
        where: { id },
        data: {
          leadRecruiterId,
        },
        include: {
          department: true,
          hiringManager: { select: { id: true, fullName: true, email: true } },
          approver: { select: { id: true, fullName: true, email: true } },
          leadRecruiter: { select: { id: true, fullName: true, email: true } },
          supportingRecruiters: {
            include: {
              recruiter: { select: { id: true, fullName: true, email: true } },
            },
          },
        },
      });

      // Đồng bộ người phụ trách vào các tin tuyển dụng (Job) thuộc yêu cầu này
      await tx.job.updateMany({
        where: { requisitionId: id },
        data: { recruiterId: leadRecruiterId },
      });

      // Ghi lịch sử chuyển giao / phân công bất biến
      const historyRecord = await tx.requisitionAssignmentHistory.create({
        data: {
          requisitionId: id,
          actorId: user.id,
          previousLeadRecruiterId: previousLeadId,
          newLeadRecruiterId: leadRecruiterId,
          supportingRecruiterIds: JSON.stringify(uniqueSupportingIds),
          action,
          notes: historyNotes,
        },
      });

      return { updatedReq, historyRecord };
    });

    // 6. Ghi Audit Log
    await recordRequestAudit(
      req,
      isHandover ? AuditAction.REQUISITION_HANDOVER : AuditAction.REQUISITION_ASSIGNED,
      'requisition',
      id,
      {
        previousLeadRecruiterId: previousLeadId,
        newLeadRecruiterId: leadRecruiterId,
        supportingRecruiterIds: uniqueSupportingIds,
        action,
        notes: historyNotes,
      }
    );

    successResponse(
      res,
      result.updatedReq,
      200,
      isHandover ? 'Chuyển giao người phụ trách tuyển dụng thành công.' : 'Phân công tuyển dụng thành công.'
    );
  }

  /**
   * SCRUM-97 / SCRUM-41: Lịch sử phân công & chuyển giao người phụ trách
   */
  static async getAssignmentHistory(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await RequisitionPolicy.canView(user, id);
    if (!canView) {
      const exists = await prisma.requisition.findUnique({ where: { id } });
      if (exists) {
        errorResponse(
          res,
          'Bạn không có quyền xem lịch sử phân công của yêu cầu tuyển dụng này.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    const history = await prisma.requisitionAssignmentHistory.findMany({
      where: { requisitionId: id },
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
        previousLeadRecruiter: { select: { id: true, fullName: true, email: true } },
        newLeadRecruiter: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Bổ sung thông tin recruiter hỗ trợ
    const allSupportingIds = new Set<string>();
    history.forEach((h) => {
      try {
        if (h.supportingRecruiterIds) {
          const ids = JSON.parse(h.supportingRecruiterIds);
          if (Array.isArray(ids)) ids.forEach((sid: string) => allSupportingIds.add(sid));
        }
      } catch {}
    });

    const supportingUsers =
      allSupportingIds.size > 0
        ? await prisma.user.findMany({
            where: { id: { in: Array.from(allSupportingIds) } },
            select: { id: true, fullName: true, email: true },
          })
        : [];
    const userMap = new Map(supportingUsers.map((u) => [u.id, u]));

    const enrichedHistory = history.map((h) => {
      let supportingRecruiters: any[] = [];
      try {
        if (h.supportingRecruiterIds) {
          const ids = JSON.parse(h.supportingRecruiterIds);
          if (Array.isArray(ids)) {
            supportingRecruiters = ids.map((sid: string) => userMap.get(sid) || { id: sid, fullName: 'Unknown' });
          }
        }
      } catch {}

      return {
        ...h,
        supportingRecruiters,
      };
    });

    successResponse(res, enrichedHistory, 200);
  }

  /**
   * SCRUM-97 / SCRUM-41: Danh sách ứng viên/đơn ứng tuyển thuộc yêu cầu tuyển dụng này
   * Nhà tuyển dụng chỉ xem được nếu được phân công phụ trách.
   */
  static async getApplications(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await RequisitionPolicy.canView(user, id);
    if (!canView) {
      const exists = await prisma.requisition.findUnique({ where: { id } });
      if (exists) {
        errorResponse(
          res,
          'Bạn không có quyền xem ứng viên của yêu cầu tuyển dụng này.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    // S3-06 / AC2: canView also permits a requisition creator. That alone
    // must not grant a recruiter access to its candidates/applications.
    if (
      user.roles.includes(RoleType.RECRUITER) &&
      !user.roles.includes(RoleType.ADMIN) &&
      !user.roles.includes(RoleType.HR_MANAGER)
    ) {
      const assignmentCount = await prisma.requisition.count({
        where: {
          id,
          OR: [
            { leadRecruiterId: user.id },
            { supportingRecruiters: { some: { recruiterId: user.id } } },
          ],
        },
      });
      if (assignmentCount === 0) {
        errorResponse(
          res,
          'Bạn chưa được phân công nên không có quyền xem ứng viên của yêu cầu này.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
    }

    const applications = await prisma.application.findMany({
      where: {
        job: { requisitionId: id },
      },
      include: {
        candidate: true,
        job: true,
        assignedRecruiter: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sanitized = applications.map((app) => ({
      ...app,
      candidate: CandidatePolicy.sanitize(user, app.candidate),
    }));

    successResponse(res, sanitized, 200);
  }
}
