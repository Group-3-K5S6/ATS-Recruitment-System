import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { JobPolicy } from '../../policies/job.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { RoleType } from '../../rbac/roles';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import type { Prisma } from '@prisma/client';

export const createJobSchema = z.object({
  title: z.string().min(3),
  requisitionId: z.string().trim().min(1).optional(),
  jobTitleId: z.string().uuid().optional(),
  departmentId: z.string().uuid(),
  hiringManagerId: z.string().uuid(),
  description: z.string().min(10),
  location: z.string().default('Hanoi'),
  workMode: z.enum(['ONSITE', 'HYBRID', 'REMOTE']).optional().default('ONSITE'),
  applicationDeadline: z.string().optional(),
  showSalary: z.boolean().optional().default(false),
});

export const updateJobSchema = z.object({
  title: z.string().min(3).optional(),
  jobTitleId: z.string().uuid().optional(),
  description: z.string().min(10).optional(),
  location: z.string().optional(),
  recruiterId: z.string().uuid().optional(),
  workMode: z.enum(['ONSITE', 'HYBRID', 'REMOTE']).optional(),
  applicationDeadline: z.string().optional(),
  showSalary: z.boolean().optional(),
});

export const approveJobSchema = z.object({
  notes: z.string().optional(),
}).optional();

export const rejectJobSchema = z.object({
  reason: z.string().trim().min(3, { message: 'Lý do từ chối cần ít nhất 3 ký tự.' }),
});

export class JobController {
  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const statusQuery = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : undefined;

    let whereClause: Prisma.JobWhereInput = {};

    const canViewGlobal =
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER);

    if (canViewGlobal) {
      // Admin và HR Manager được xem toàn hệ thống.
      whereClause = {};
    } else if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      // Chỉ các vị trí do mình quản lý hoặc thuộc phòng ban.
      whereClause = {
        OR: [
          { hiringManagerId: user.id },
          ...(user.departmentId
            ? [{ departmentId: user.departmentId }]
            : []),
        ],
      };
    } else if (user.roles.includes(RoleType.RECRUITER)) {
      // Recruiter chỉ xem vị trí được phân công.
      whereClause = {
        recruiterId: user.id,
      };
    } else if (user.roles.includes(RoleType.APPROVER)) {
      // Người duyệt xem vị trí thuộc yêu cầu được giao duyệt.
      whereClause = {
        requisition: {
          is: {
            approverId: user.id,
          },
        },
      };
    } else if (user.roles.includes(RoleType.CANDIDATE)) {
      // Ứng viên CHỈ xem vị trí đã xuất bản công khai.
      whereClause = {
        status: 'PUBLISHED',
      };
    } else {
      errorResponse(
        res,
        'Bạn không có quyền xem danh sách vị trí tuyển dụng.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    // Nếu có query status (và người dùng không phải CANDIDATE bị ghim cứng PUBLISHED)
    if (statusQuery && !user.roles.includes(RoleType.CANDIDATE)) {
      whereClause = {
        ...whereClause,
        status: statusQuery,
      };
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        department: true,
        jobTitle: true,
        hiringManager: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        recruiter: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        publishedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Đếm số ứng viên theo từng vị trí của Hiring Manager
    const isHiringManagerScope =
      !user.roles.includes(RoleType.ADMIN) &&
      !user.roles.includes(RoleType.HR_MANAGER) &&
      user.roles.includes(RoleType.HIRING_MANAGER);

    if (isHiringManagerScope) {
      const jobIds = jobs.map((job) => job.id);

      const applicationGroups = jobIds.length
        ? await prisma.application.groupBy({
            by: ['jobId', 'candidateId'],
            where: {
              jobId: {
                in: jobIds,
              },
            },
          })
        : [];

      const candidateCounts = new Map<string, number>();

      for (const application of applicationGroups) {
        const currentCount =
          candidateCounts.get(application.jobId) ?? 0;

        candidateCounts.set(
          application.jobId,
          currentCount + 1
        );
      }

      const jobsWithCounts = jobs.map((job) => ({
        ...job,
        candidateCount: candidateCounts.get(job.id) ?? 0,
      }));

      successResponse(res, jobsWithCounts, 200);
      return;
    }

    const isRecruiterScope =
      !user.roles.includes(RoleType.ADMIN) &&
      !user.roles.includes(RoleType.HR_MANAGER) &&
      !user.roles.includes(RoleType.HIRING_MANAGER) &&
      user.roles.includes(RoleType.RECRUITER);

    if (isRecruiterScope) {
      const jobIds = jobs.map((job) => job.id);

      const applicationGroups = jobIds.length
        ? await prisma.application.groupBy({
            by: ['jobId', 'candidateId'],
            where: {
              jobId: {
                in: jobIds,
              },
              assignedRecruiterId: user.id,
            },
          })
        : [];

      const candidateCounts = new Map<string, number>();

      for (const application of applicationGroups) {
        const currentCount =
          candidateCounts.get(application.jobId) ?? 0;

        candidateCounts.set(
          application.jobId,
          currentCount + 1
        );
      }

      const jobsWithCounts = jobs.map((job) => ({
        ...job,
        candidateCount: candidateCounts.get(job.id) ?? 0,
      }));

      successResponse(res, jobsWithCounts, 200);
      return;
    }

    successResponse(res, jobs, 200);
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await JobPolicy.canView(user, id);
    if (!canView) {
      errorResponse(res, 'Bạn không có quyền xem tin tuyển dụng này.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        department: true,
        jobTitle: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        publishedBy: { select: { id: true, fullName: true, email: true } },
        requisition: {
          select: {
            id: true,
            title: true,
            status: true,
            proposedSalaryMin: true,
            proposedSalaryMax: true,
            requirements: true,
            targetDate: true,
          },
        },
      },
    });

    if (!job) {
      errorResponse(res, 'Không tìm thấy tin tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    successResponse(res, job, 200);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    const user = req.user!;

    // Recruiters may only create postings within their own department.
    if (
      user.roles.includes(RoleType.RECRUITER) &&
      !user.roles.includes(RoleType.ADMIN) &&
      !user.roles.includes(RoleType.HR_MANAGER) &&
      (!user.departmentId || data.departmentId !== user.departmentId)
    ) {
      errorResponse(res, 'Bạn chỉ được tạo tin tuyển dụng trong phòng ban của mình.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    if (data.requisitionId) {
      const requisition = await prisma.requisition.findUnique({
        where: { id: data.requisitionId },
        select: { id: true, status: true },
      });
      if (!requisition) {
        errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
        return;
      }
      if (requisition.status !== 'APPROVED') {
        errorResponse(res, 'Chỉ yêu cầu ở trạng thái Đã duyệt mới được tạo tin tuyển dụng.', 400, 'INVALID_STATUS');
        return;
      }
    }

    const deadlineDate = data.applicationDeadline ? new Date(data.applicationDeadline) : null;

    const job = await prisma.job.create({
      data: {
        title: data.title,
        requisitionId: data.requisitionId,
        jobTitleId: data.jobTitleId,
        departmentId: data.departmentId,
        hiringManagerId: data.hiringManagerId,
        recruiterId: user.id,
        description: data.description,
        location: data.location || 'Hanoi',
        workMode: data.workMode || 'ONSITE',
        applicationDeadline: deadlineDate,
        showSalary: data.showSalary ?? false,
        status: 'DRAFT',
      },
      include: {
        department: true,
        jobTitle: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
      },
    });

    successResponse(res, job, 201, 'Job posting created in DRAFT state.');
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canUpdate = await JobPolicy.canUpdate(user, id);
    if (!canUpdate) {
      errorResponse(res, 'Bạn không có quyền sửa tin tuyển dụng này.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    if (
      req.body.recruiterId !== undefined &&
      !user.roles.includes(RoleType.ADMIN) &&
      !user.roles.includes(RoleType.HR_MANAGER)
    ) {
      errorResponse(res, 'Bạn không có quyền thay đổi người phụ trách tin tuyển dụng.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const updateData: Prisma.JobUpdateInput = { ...req.body };
    if (req.body.applicationDeadline) {
      updateData.applicationDeadline = new Date(req.body.applicationDeadline);
    }

    const updated = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        department: true,
        jobTitle: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        publishedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    successResponse(res, updated, 200, 'Job updated successfully.');
  }

  /**
   * SCRUM-105: Nộp tin tuyển dụng để chuyển sang trạng thái PENDING_APPROVAL
   */
  static async submitForApproval(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canSubmit = await JobPolicy.canSubmitForApproval(user, id);
    if (!canSubmit) {
      errorResponse(res, 'Bạn không có quyền gửi duyệt tin tuyển dụng này.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Không tìm thấy tin tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    if (existing.status === 'PUBLISHED') {
      errorResponse(res, 'Tin tuyển dụng đã được xuất bản.', 400, 'INVALID_STATUS');
      return;
    }

    if (existing.status === 'APPROVED') {
      errorResponse(res, 'Tin tuyển dụng đã được phê duyệt.', 400, 'ALREADY_APPROVED');
      return;
    }

    if (!['DRAFT', 'REJECTED'].includes(existing.status)) {
      errorResponse(res, 'Tin không ở trạng thái có thể gửi duyệt.', 400, 'INVALID_STATUS');
      return;
    }

    const updated = await prisma.job.update({
      where: { id },
      data: {
        status: 'PENDING_APPROVAL',
        rejectionReason: null,
      },
      include: {
        department: true,
        jobTitle: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
      },
    });

    try {
      await recordRequestAudit(
        req,
        AuditAction.JOB_POSTING_SUBMITTED,
        'job',
        updated.id,
        {
          title: updated.title,
          submittedById: user.id,
        }
      );
    } catch (auditErr) {
      console.error('Lỗi ghi audit log submit tin tuyển dụng:', auditErr);
    }

    successResponse(res, updated, 200, 'Đã gửi tin tuyển dụng để phê duyệt.');
  }

  /**
   * SCRUM-105: Trưởng phòng Nhân sự duyệt tin tuyển dụng
   * Tiêu chí: Tin phải qua duyệt trước khi hiển thị công khai
   */
  static async approve(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canApprove = await JobPolicy.canApprove(user, id);
    if (!canApprove) {
      errorResponse(
        res,
        'Chỉ Trưởng phòng Nhân sự hoặc Quản trị viên mới có quyền phê duyệt tin tuyển dụng.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Không tìm thấy tin tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    if (existing.status === 'PUBLISHED') {
      errorResponse(res, 'Tin tuyển dụng đã được xuất bản.', 400, 'INVALID_STATUS');
      return;
    }

    if (existing.status === 'APPROVED') {
      errorResponse(res, 'Tin tuyển dụng đã ở trạng thái Đã duyệt.', 400, 'ALREADY_APPROVED');
      return;
    }

    if (existing.status !== 'PENDING_APPROVAL') {
      errorResponse(res, 'Tin phải được gửi duyệt trước khi phê duyệt.', 400, 'INVALID_STATUS');
      return;
    }

    const approvedAt = new Date();
    const notes = req.body?.notes?.trim() || null;

    const updated = await prisma.job.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt,
        approvalNotes: notes,
        rejectionReason: null,
      },
      include: {
        department: true,
        jobTitle: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        publishedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    try {
      await recordRequestAudit(
        req,
        AuditAction.JOB_POSTING_APPROVED,
        'job',
        updated.id,
        {
          approvedById: user.id,
          approvedAt: approvedAt.toISOString(),
          title: updated.title,
          notes,
        }
      );
    } catch (auditErr) {
      console.error('Lỗi ghi audit log approve tin tuyển dụng:', auditErr);
    }

    successResponse(res, updated, 200, 'Đã phê duyệt tin tuyển dụng thành công.');
  }

  /**
   * SCRUM-105: Trưởng phòng Nhân sự từ chối tin tuyển dụng
   */
  static async reject(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canApprove = await JobPolicy.canApprove(user, id);
    if (!canApprove) {
      errorResponse(
        res,
        'Chỉ Trưởng phòng Nhân sự hoặc Quản trị viên mới có quyền từ chối tin tuyển dụng.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Không tìm thấy tin tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    if (existing.status === 'PUBLISHED') {
      errorResponse(
        res,
        'Không thể từ chối tin tuyển dụng đã xuất bản. Vui lòng gỡ tin trước khi từ chối.',
        400,
        'INVALID_STATUS'
      );
      return;
    }

    if (existing.status !== 'PENDING_APPROVAL') {
      errorResponse(res, 'Chỉ được từ chối tin đang chờ duyệt.', 400, 'INVALID_STATUS');
      return;
    }

    const reason = req.body.reason.trim();

    const updated = await prisma.job.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        approvedById: null,
        approvedAt: null,
      },
      include: {
        department: true,
        jobTitle: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        publishedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    try {
      await recordRequestAudit(
        req,
        AuditAction.JOB_POSTING_REJECTED,
        'job',
        updated.id,
        {
          rejectedById: user.id,
          reason,
          title: updated.title,
        }
      );
    } catch (auditErr) {
      console.error('Lỗi ghi audit log reject tin tuyển dụng:', auditErr);
    }

    successResponse(res, updated, 200, 'Đã từ chối tin tuyển dụng.');
  }

  /**
   * SCRUM-105: Xuất bản tin tuyển dụng
   * Tiêu chí 1: Tin phải qua duyệt trước khi hiển thị công khai (status phải là APPROVED)
   * Tiêu chí 3: Ghi lại người xuất bản và thời điểm
   */
  static async publish(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    // Chỉ HR_MANAGER và ADMIN được xuất bản tin ra ngoài để chuẩn hóa thương hiệu
    const canPublish = await JobPolicy.canPublish(user, id);
    if (!canPublish) {
      errorResponse(
        res,
        'Chỉ Trưởng phòng Nhân sự hoặc Quản trị viên mới có quyền xuất bản tin tuyển dụng.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Không tìm thấy tin tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    // Tiêu chí 1: Tin phải qua duyệt trước khi hiển thị công khai
    if (existing.status !== 'APPROVED') {
      if (existing.status === 'PUBLISHED') {
        errorResponse(res, 'Tin tuyển dụng đã được xuất bản trước đó.', 400, 'ALREADY_PUBLISHED');
        return;
      }
      errorResponse(
        res,
        'Tin tuyển dụng phải được phê duyệt trước khi xuất bản công khai.',
        400,
        'INVALID_STATUS'
      );
      return;
    }

    if (!existing.approvedById || !existing.approvedAt) {
      errorResponse(res, 'Tin chưa có người duyệt và thời điểm duyệt hợp lệ.', 400, 'INVALID_APPROVAL');
      return;
    }

    // Tiêu chí 3: Ghi lại người xuất bản và thời điểm
    const publishedAt = new Date();

    const updated = await prisma.job.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedById: user.id,
        publishedAt,
      },
      include: {
        department: true,
        jobTitle: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        publishedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    try {
      await recordRequestAudit(
        req,
        AuditAction.JOB_POSTING_PUBLISHED,
        'job',
        updated.id,
        {
          publishedById: user.id,
          publishedAt: publishedAt.toISOString(),
          title: updated.title,
        }
      );
    } catch (auditErr) {
      console.error('Lỗi ghi audit log publish tin tuyển dụng:', auditErr);
    }

    successResponse(res, updated, 200, 'Tin tuyển dụng đã được xuất bản công khai.');
  }

  /**
   * SCRUM-105: Gỡ tin tuyển dụng khỏi hiển thị công khai
   */
  static async unpublish(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canPublish = await JobPolicy.canPublish(user, id);
    if (!canPublish) {
      errorResponse(
        res,
        'Chỉ Trưởng phòng Nhân sự hoặc Quản trị viên mới có quyền gỡ tin tuyển dụng.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Không tìm thấy tin tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    if (existing.status !== 'PUBLISHED') {
      errorResponse(
        res,
        'Chỉ có thể gỡ tin tuyển dụng đang ở trạng thái xuất bản.',
        400,
        'INVALID_STATUS'
      );
      return;
    }

    const updated = await prisma.job.update({
      where: { id },
      data: {
        status: 'CLOSED',
      },
      include: {
        department: true,
        jobTitle: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        publishedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    try {
      await recordRequestAudit(
        req,
        AuditAction.JOB_POSTING_CLOSED,
        'job',
        updated.id,
        {
          closedById: user.id,
          closedAt: new Date().toISOString(),
          title: updated.title,
        }
      );
    } catch (auditErr) {
      console.error('Lỗi ghi audit log unpublish tin tuyển dụng:', auditErr);
    }

    successResponse(res, updated, 200, 'Đã gỡ tin tuyển dụng thành công.');
  }

  /**
   * SCRUM-105: Tiêu chí 2: Xem trước đúng như giao diện công khai trước khi xuất bản
   * Trả về toàn bộ dữ liệu tin tuyển dụng + thông tin thương hiệu công ty (CompanyProfile)
   */
  static async preview(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canPreview = await JobPolicy.canPreview(user, id);
    if (!canPreview) {
      errorResponse(res, 'Bạn không có quyền xem trước tin tuyển dụng này.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        department: true,
        jobTitle: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        publishedBy: { select: { id: true, fullName: true, email: true } },
        requisition: {
          select: {
            id: true,
            title: true,
            proposedSalaryMin: true,
            proposedSalaryMax: true,
            requirements: true,
            targetDate: true,
            description: true,
          },
        },
      },
    });

    if (!job) {
      errorResponse(res, 'Không tìm thấy tin tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    // Nạp thông tin thương hiệu công ty
    const savedCompanyProfile = await prisma.companyProfile.findUnique({
      where: { id: 'default' },
    });
    const companyProfile = savedCompanyProfile?.isPublished ? savedCompanyProfile : {
      id: 'default',
      companyName: 'ATS Recruitment',
      tagline: 'Kiến tạo tương lai cùng đội ngũ tinh hoa',
      introduction: 'Chào mừng bạn đến với cổng thông tin việc làm chính thức của công ty.',
      culture: 'Môi trường làm việc chuyên nghiệp, đổi mới sáng tạo và tôn trọng giá trị cá nhân.',
      benefits: 'Chế độ đãi ngộ cạnh tranh, bảo hiểm chăm sóc sức khỏe, đào tạo nâng cao chuyên môn.',
      website: 'https://ats.local',
      contactEmail: 'careers@ats.local',
      location: 'Hà Nội, Việt Nam',
      isPublished: true,
      logoData: null,
      bannerData: null,
      updatedAt: new Date(),
    };

    // Xử lý hiển thị dải lương theo cấu hình showSalary
    let salaryMin: number | null = null;
    let salaryMax: number | null = null;
    let salaryDisplayText = 'Thoả thuận';

    if (job.showSalary) {
      salaryMin = job.requisition?.proposedSalaryMin ?? job.jobTitle?.minSalary ?? null;
      salaryMax = job.requisition?.proposedSalaryMax ?? job.jobTitle?.maxSalary ?? null;

      if (salaryMin !== null && salaryMax !== null) {
        salaryDisplayText = `${salaryMin.toLocaleString('vi-VN')} - ${salaryMax.toLocaleString('vi-VN')} VNĐ`;
      } else if (salaryMin !== null) {
        salaryDisplayText = `Từ ${salaryMin.toLocaleString('vi-VN')} VNĐ`;
      } else if (salaryMax !== null) {
        salaryDisplayText = `Lên đến ${salaryMax.toLocaleString('vi-VN')} VNĐ`;
      }
    }

    const previewData = {
      job: {
        ...job,
        salary: {
          showSalary: job.showSalary,
          min: salaryMin,
          max: salaryMax,
          displayText: salaryDisplayText,
        },
      },
      companyProfile,
    };

    successResponse(res, previewData, 200);
  }
}
