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
};

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
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().optional(),
});

export class RequisitionController {
  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    let whereClause = {};
    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER) || user.roles.includes(RoleType.RECRUITER)) {
      // Full list only for roles granted organization-wide requisition visibility.
      whereClause = {};
    } else if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      whereClause = {
        OR: [
          { hiringManagerId: user.id },
          ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
        ],
      };
    } else if (user.roles.includes(RoleType.APPROVER)) {
      whereClause = { approverId: user.id };
    } else {
      errorResponse(res, 'Bạn không có quyền xem danh sách yêu cầu tuyển dụng.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const requisitions = await prisma.requisition.findMany({
      where: whereClause,
      include: {
        department: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, requisitions, 200);
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
        jobs: true,
      },
    });

    successResponse(res, requisition, 200);
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

    let resolvedApproverId: string | undefined = data.approverId || undefined;
    let approvalWorkflowId: string | undefined = undefined;
    let approvalWorkflowVersion: number | undefined = undefined;
    let approvalChain: string | undefined = undefined;

    if (!isDraft) {
      const resolved = await ApprovalWorkflowService.resolveApprovalChain(
        departmentId,
        salaryMax !== undefined ? salaryMax : salaryMin
      );

      if (resolved.matched) {
        resolvedApproverId = resolved.currentApproverId;
        approvalWorkflowId = resolved.workflowId;
        approvalWorkflowVersion = resolved.workflowVersion;
        approvalChain = JSON.stringify(resolved.steps);
      } else if (resolved.reason === 'NO_MATCHING_RANGE') {
        errorResponse(
          res,
          'Mức lương đề xuất không phù hợp với bất kỳ dải phê duyệt nào của phòng ban.',
          400,
          'NO_MATCHING_APPROVAL_RANGE'
        );
        return;
      } else if (resolved.reason === 'NO_ACTIVE_APPROVER' || resolved.reason === 'EMPTY_APPROVER_LIST') {
        errorResponse(
          res,
          'Không có người phê duyệt đang hoạt động phù hợp cho luồng phê duyệt này.',
          400,
          'NO_ACTIVE_APPROVER'
        );
        return;
      }
    }

    if (!isDraft && resolvedApproverId && !approvalWorkflowId) {
      const manualApprover = await prisma.user.findUnique({
        where: { id: resolvedApproverId },
        select: { id: true, isActive: true },
      });
      if (!manualApprover || !manualApprover.isActive) {
        errorResponse(
          res,
          'Người phê duyệt không tồn tại hoặc đã bị vô hiệu hóa.',
          400,
          'NO_ACTIVE_APPROVER'
        );
        return;
      }
    }

    const requisition = await prisma.requisition.create({
      data: {
        title: title || 'Bản nháp yêu cầu tuyển dụng',
        departmentId,
        hiringManagerId: user.id,
        headcount,
        budget,
        approverId: resolvedApproverId,
        approvalWorkflowId,
        approvalWorkflowVersion,
        approvalChain,
        jobTitleId: jobTitleRecord?.id,
        reason: reason || undefined,
        proposedSalaryMin: salaryMin,
        proposedSalaryMax: salaryMax,
        targetDate,
        description: description || undefined,
        requirements: requirements || undefined,
        salaryExplanation: salaryExplanation || undefined,
        status,
      },
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

    const existing = await prisma.requisition.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    if (!['DRAFT', 'PENDING_APPROVAL'].includes(existing.status)) {
      errorResponse(
        res,
        'Only draft or pending requisitions can be edited.',
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

    let resolvedApproverId = data.approverId ?? existing.approverId;
    let approvalWorkflowId: string | null = existing.approvalWorkflowId;
    let approvalWorkflowVersion: number | null = existing.approvalWorkflowVersion;
    let approvalChain: string | null = existing.approvalChain;

    const willBePending = !isDraft && (data.status === 'PENDING_APPROVAL' || existing.status === 'DRAFT');

    if (willBePending && (!existing.approvalChain || existing.status === 'DRAFT')) {
      const effectiveSalary =
        salaryMax !== null && salaryMax !== undefined
          ? salaryMax
          : salaryMin !== null && salaryMin !== undefined
            ? salaryMin
            : undefined;

      const resolved = await ApprovalWorkflowService.resolveApprovalChain(departmentId, effectiveSalary);

      if (resolved.matched) {
        resolvedApproverId = resolved.currentApproverId;
        approvalWorkflowId = resolved.workflowId ?? null;
        approvalWorkflowVersion = resolved.workflowVersion ?? null;
        approvalChain = JSON.stringify(resolved.steps);
      } else if (resolved.reason === 'NO_MATCHING_RANGE') {
        errorResponse(
          res,
          'Mức lương đề xuất không phù hợp với bất kỳ dải phê duyệt nào của phòng ban.',
          400,
          'NO_MATCHING_APPROVAL_RANGE'
        );
        return;
      } else if (resolved.reason === 'NO_ACTIVE_APPROVER' || resolved.reason === 'EMPTY_APPROVER_LIST') {
        errorResponse(
          res,
          'Không có người phê duyệt đang hoạt động phù hợp cho luồng phê duyệt này.',
          400,
          'NO_ACTIVE_APPROVER'
        );
        return;
      }
    }

    if (!isDraft && resolvedApproverId && !approvalWorkflowId) {
      const manualApprover = await prisma.user.findUnique({
        where: { id: resolvedApproverId },
        select: { id: true, isActive: true },
      });
      if (!manualApprover || !manualApprover.isActive) {
        errorResponse(
          res,
          'Người phê duyệt không tồn tại hoặc đã bị vô hiệu hóa.',
          400,
          'NO_ACTIVE_APPROVER'
        );
        return;
      }
    }

    const updated = await prisma.requisition.update({
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
        approverId: resolvedApproverId ?? null,
        approvalWorkflowId: approvalWorkflowId ?? null,
        approvalWorkflowVersion: approvalWorkflowVersion ?? null,
        approvalChain: approvalChain ?? null,
        jobTitleId: jobTitleId ?? null,
        reason,
        proposedSalaryMin: salaryMin,
        proposedSalaryMax: salaryMax,
        targetDate,
        description: description || null,
        requirements: requirements || null,
        salaryExplanation: salaryExplanation || null,
        status: isDraft ? 'DRAFT' : 'PENDING_APPROVAL',
      },
    });

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
    const { decision, notes } = req.body;
    const user = req.user!;

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
        'Chỉ có thể phê duyệt yêu cầu đang ở trạng thái chờ duyệt.',
        400,
        'INVALID_STATUS'
      );
      return;
    }

    let newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    let nextApproverId: string | null = existing.approverId;
    let updatedChainString = existing.approvalChain;

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

        if (currentStepIndex !== -1) {
          if (decision === 'REJECT') {
            steps[currentStepIndex].status = 'REJECTED';
            steps[currentStepIndex].decisionAt = new Date().toISOString();
            steps[currentStepIndex].notes = notes || null;
            newStatus = 'REJECTED';
            updatedChainString = JSON.stringify(steps);
          } else {
            // APPROVE cấp hiện tại
            steps[currentStepIndex].status = 'APPROVED';
            steps[currentStepIndex].decisionAt = new Date().toISOString();
            steps[currentStepIndex].notes = notes || null;

            // Kiểm tra xem còn cấp tiếp theo không
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
        // Fallback to legacy single-step
      }
    }

    const updated = await prisma.requisition.update({
      where: { id },
      data: {
        status: newStatus,
        approverId: nextApproverId,
        approvalChain: updatedChainString,
      },
    });

    const action =
      decision === 'APPROVE'
        ? AuditAction.REQUISITION_APPROVED
        : AuditAction.REQUISITION_REJECTED;

    await recordRequestAudit(req, action, 'requisition', updated.id, {
      status: newStatus,
      stepDecision: decision,
    });

    const message =
      newStatus === 'PENDING_APPROVAL'
        ? 'Cấp duyệt hiện tại đã phê duyệt thành công. Yêu cầu đã được chuyển tới cấp duyệt tiếp theo.'
        : `Yêu cầu tuyển dụng đã được ${newStatus === 'APPROVED' ? 'phê duyệt' : 'từ chối'}.`;

    successResponse(res, updated, 200, message);
  }
}

