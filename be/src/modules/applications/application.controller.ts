import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { RoleType } from '../../rbac/roles';
import { CandidatePolicy } from '../../policies/candidate.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import type { Prisma } from '@prisma/client';

export const assignApplicationRecruiterSchema = z.object({
  recruiterId: z.string().uuid().or(z.string().trim().min(1)),
});

export class ApplicationController {
  /**
   * SCRUM-97 / SCRUM-41: Tìm kiếm & danh sách ứng dụng (Applications)
   * Nhà tuyển dụng chỉ tìm kiếm ứng dụng của vị trí được giao.
   */
  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const { q, search, stage, status, jobId, requisitionId } = req.query as {
      q?: string;
      search?: string;
      stage?: string;
      status?: string;
      jobId?: string;
      requisitionId?: string;
    };

    const keyword = (q || search || '').trim();

    // Base scoping condition
    let scopeWhere: Prisma.ApplicationWhereInput = {};

    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      // Global access
      scopeWhere = {};
    } else if (user.roles.includes(RoleType.RECRUITER)) {
      // SCRUM-41: Recruiter CHỈ tìm kiếm/xem ứng dụng của vị trí được giao
      scopeWhere = {
        OR: [
          { assignedRecruiterId: user.id },
          { job: { recruiterId: user.id } },
          { job: { requisition: { leadRecruiterId: user.id } } },
          { job: { requisition: { supportingRecruiters: { some: { recruiterId: user.id } } } } },
        ],
      };
    } else if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      scopeWhere = {
        job: {
          OR: [
            { hiringManagerId: user.id },
            ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
          ],
        },
      };
    } else if (user.roles.includes(RoleType.INTERVIEWER)) {
      scopeWhere = {
        interviews: {
          some: { interviewerId: user.id },
        },
      };
    } else if (user.roles.includes(RoleType.CANDIDATE)) {
      scopeWhere = {
        candidate: { userId: user.id },
      };
    } else if (user.roles.includes(RoleType.APPROVER)) {
      scopeWhere = {
        job: {
          requisition: { approverId: user.id },
        },
      };
    } else {
      errorResponse(res, 'Bạn không có quyền truy cập danh sách ứng tuyển.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    // Additional query filters
    const filterConditions: Prisma.ApplicationWhereInput[] = [scopeWhere];

    if (stage) {
      filterConditions.push({ stage });
    }
    if (status) {
      filterConditions.push({ status });
    }
    if (jobId) {
      filterConditions.push({ jobId });
    }
    if (requisitionId) {
      filterConditions.push({ job: { requisitionId } });
    }
    if (keyword) {
      filterConditions.push({
        candidate: {
          OR: [
            { fullName: { contains: keyword } },
            { email: { contains: keyword } },
            { phone: { contains: keyword } },
          ],
        },
      });
    }

    const applications = await prisma.application.findMany({
      where: {
        AND: filterConditions,
      },
      include: {
        candidate: true,
        job: {
          include: {
            department: true,
            requisition: {
              include: {
                supportingRecruiters: {
                  include: {
                    recruiter: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
              },
            },
          },
        },
        assignedRecruiter: {
          select: { id: true, fullName: true, email: true },
        },
        interviews: {
          select: { id: true, scheduledAt: true, status: true, interviewerId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sanitized = applications.map((app) => ({
      ...app,
      candidate: CandidatePolicy.sanitize(user, app.candidate),
    }));

    successResponse(res, sanitized, 200);
  }

  /**
   * Chi tiết một ứng dụng
   */
  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        candidate: true,
        job: {
          include: {
            department: true,
            requisition: {
              include: {
                supportingRecruiters: true,
              },
            },
          },
        },
        assignedRecruiter: {
          select: { id: true, fullName: true, email: true },
        },
        interviews: true,
        offers: true,
      },
    });

    if (!application) {
      errorResponse(res, 'Không tìm thấy đơn ứng tuyển.', 404, 'NOT_FOUND');
      return;
    }

    // Scope check
    let hasAccess = false;
    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      hasAccess = true;
    } else if (user.roles.includes(RoleType.RECRUITER)) {
      hasAccess =
        application.assignedRecruiterId === user.id ||
        application.job.recruiterId === user.id ||
        application.job.requisition?.leadRecruiterId === user.id ||
        application.job.requisition?.supportingRecruiters?.some((s) => s.recruiterId === user.id) === true;
    } else if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      hasAccess =
        application.job.hiringManagerId === user.id ||
        (!!user.departmentId && application.job.departmentId === user.departmentId);
    } else if (user.roles.includes(RoleType.INTERVIEWER)) {
      hasAccess = application.interviews.some((i) => i.interviewerId === user.id);
    } else if (user.roles.includes(RoleType.CANDIDATE)) {
      hasAccess = application.candidate.userId === user.id;
    } else if (user.roles.includes(RoleType.APPROVER)) {
      hasAccess = application.job.requisition?.approverId === user.id;
    }

    if (!hasAccess) {
      errorResponse(
        res,
        'Bạn không có quyền truy cập hồ sơ ứng tuyển ngoài vị trí được giao.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    successResponse(
      res,
      {
        ...application,
        candidate: CandidatePolicy.sanitize(user, application.candidate),
      },
      200
    );
  }

  /**
   * Phân công nhà tuyển dụng phụ trách một hồ sơ ứng tuyển cụ thể
   */
  static async assignRecruiter(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { recruiterId } = req.body;
    const user = req.user!;

    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        job: {
          include: {
            requisition: true,
          },
        },
      },
    });

    if (!application) {
      errorResponse(res, 'Không tìm thấy đơn ứng tuyển.', 404, 'NOT_FOUND');
      return;
    }

    // Only Admin, HR Manager, or Lead Recruiter of the requisition can assign
    const canAssign =
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      (user.roles.includes(RoleType.RECRUITER) && application.job.requisition?.leadRecruiterId === user.id);

    if (!canAssign) {
      errorResponse(
        res,
        'Bạn không có quyền phân công người phụ trách đơn ứng tuyển này.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    // Verify recruiter target
    const target = await prisma.user.findUnique({
      where: { id: recruiterId },
      include: { roles: { include: { role: true } } },
    });

    if (!target || !target.isActive || !target.roles.some((r) => r.role.name === RoleType.RECRUITER)) {
      errorResponse(
        res,
        'Nhà tuyển dụng không hợp lệ, không tồn tại hoặc đã bị vô hiệu hóa.',
        400,
        'INVALID_RECRUITER'
      );
      return;
    }

    const updated = await prisma.application.update({
      where: { id },
      data: { assignedRecruiterId: recruiterId },
      include: {
        assignedRecruiter: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    await recordRequestAudit(req, AuditAction.CANDIDATE_UPDATED, 'application', id, {
      assignedRecruiterId: recruiterId,
    });

    successResponse(res, updated, 200, 'Phân công nhà tuyển dụng cho ứng viên thành công.');
  }
}
