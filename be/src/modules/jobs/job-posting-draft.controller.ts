import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { RoleType } from '../../rbac/roles';
import { AuditAction } from '../../rbac/types';
import { errorResponse, successResponse } from '../../utils/response';

// S3-09: IDs already stored in ATS are strings, not necessarily UUIDs.
// S3-10 (approve/publish) is a separate workflow: this endpoint saves DRAFT only.
export const createJobPostingDraftSchema = z.object({
  requisitionId: z.string().trim().min(1, 'Vui lòng chọn yêu cầu tuyển dụng.').max(191),
  title: z.string().trim().min(3, 'Tiêu đề cần ít nhất 3 ký tự.').max(200),
  description: z.string().trim().min(10, 'Mô tả cần ít nhất 10 ký tự.'),
  location: z.string().trim().min(1, 'Địa điểm không được để trống.').max(200),
  workMode: z.enum(['ONSITE', 'HYBRID', 'REMOTE']),
  applicationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Hạn hồ sơ phải có dạng YYYY-MM-DD.'),
  showSalary: z.boolean().optional().default(false),
});

export type CreateJobPostingDraftInput = z.infer<typeof createJobPostingDraftSchema>;

function parseDeadline(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export class JobPostingDraftController {
  static async createDraft(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const data = req.body as CreateJobPostingDraftInput;

    const deadlineDate = parseDeadline(data.applicationDeadline);
    if (!deadlineDate) {
      errorResponse(res, 'Hạn nhận hồ sơ không tồn tại trên lịch.', 400, 'VALIDATION_ERROR');
      return;
    }
    if (data.applicationDeadline < todayLocal()) {
      errorResponse(res, 'Hạn nhận hồ sơ không được ở quá khứ.', 400, 'VALIDATION_ERROR');
      return;
    }

    try {
      const requisition = await prisma.requisition.findUnique({
        where: { id: data.requisitionId },
        select: {
          id: true,
          status: true,
          departmentId: true,
          hiringManagerId: true,
          jobTitleId: true,
          leadRecruiterId: true,
          supportingRecruiters: {
            where: { recruiterId: user.id },
            select: { recruiterId: true },
            take: 1,
          },
        },
      });

      if (!requisition) {
        errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
        return;
      }

      const elevated = user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER);
      const assigned = requisition.leadRecruiterId === user.id || requisition.supportingRecruiters.length > 0;
      if (!elevated && (!user.roles.includes(RoleType.RECRUITER) || !assigned)) {
        // An authenticated recruiter must not write draft postings for other teams.
        errorResponse(res, 'Bạn không được phân công phụ trách yêu cầu tuyển dụng này.', 403, 'FORBIDDEN_SCOPE');
        return;
      }

      if (requisition.status !== 'APPROVED') {
        errorResponse(res, 'Chỉ yêu cầu ở trạng thái Đã duyệt mới được tạo tin tuyển dụng.', 400, 'INVALID_STATUS');
        return;
      }

      // Job and its audit entry are atomic: never report success without an audit log.
      const job = await prisma.$transaction(async (tx) => {
        const created = await tx.job.create({
          data: {
            title: data.title,
            description: data.description,
            location: data.location,
            workMode: data.workMode,
            applicationDeadline: deadlineDate,
            showSalary: data.showSalary,
            status: 'DRAFT',
            requisitionId: requisition.id,
            departmentId: requisition.departmentId,
            hiringManagerId: requisition.hiringManagerId,
            jobTitleId: requisition.jobTitleId,
            recruiterId: user.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: AuditAction.CREATE_JOB_POSTING_DRAFT,
            resourceType: 'job',
            resourceId: created.id,
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers['user-agent'] || null,
            metadata: JSON.stringify({
              requisitionId: requisition.id,
              title: created.title,
              workMode: created.workMode,
              applicationDeadline: data.applicationDeadline,
              showSalary: created.showSalary,
            }),
          },
        });
        return created;
      });

      successResponse(res, job, 201, 'Đã lưu bản nháp tin tuyển dụng.');
    } catch (error) {
      console.error('Không thể lưu bản nháp tin tuyển dụng:', error);
      errorResponse(res, 'Không thể lưu bản nháp tin tuyển dụng do lỗi hệ thống.', 500, 'INTERNAL_SERVER_ERROR');
    }
  }
}
