import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { JobPolicy } from '../../policies/job.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { RoleType } from '../../rbac/roles';
import type { Prisma } from '@prisma/client';


export const createJobSchema = z.object({
  title: z.string().min(3),
  requisitionId: z.string().uuid().optional(),
  jobTitleId: z.string().uuid().optional(),
  departmentId: z.string().uuid(),
  hiringManagerId: z.string().uuid(),
  description: z.string().min(10),
  location: z.string().default('Hanoi'),
});

export const updateJobSchema = z.object({
  title: z.string().min(3).optional(),
  jobTitleId: z.string().uuid().optional(),
  description: z.string().min(10).optional(),
  location: z.string().optional(),
  recruiterId: z.string().uuid().optional(),
});

export class JobController {
  static async list(req: Request, res: Response): Promise<void> {
  const user = req.user!;

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
    // Ứng viên chỉ xem vị trí đã đăng tuyển.
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

  const jobs = await prisma.job.findMany({
    where: whereClause,
    include: {
      department: true,
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
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Dem so ung vien theo tung vi tri cua Hiring Manager
const isHiringManagerScope =
  !user.roles.includes(RoleType.ADMIN) &&
  !user.roles.includes(RoleType.HR_MANAGER) &&
  user.roles.includes(RoleType.HIRING_MANAGER);

if (isHiringManagerScope) {
  const jobIds = jobs.map((job) => job.id);

  const applicationGroups = jobIds.length
    ? await prisma.application.groupBy({
        by: ["jobId", "candidateId"],
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
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
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

    const job = await prisma.job.create({
      data: {
        title: data.title,
        requisitionId: data.requisitionId,
        jobTitleId: data.jobTitleId,
        departmentId: data.departmentId,
        hiringManagerId: data.hiringManagerId,
        recruiterId: user.id,
        description: data.description,
        location: data.location,
        status: 'DRAFT',
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

    const updated = await prisma.job.update({
      where: { id },
      data: req.body,
    });

    successResponse(res, updated, 200, 'Job updated successfully.');
  }

  static async publish(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const canPublish = await JobPolicy.canUpdate(req.user!, id);
    if (!canPublish) {
      errorResponse(res, 'Bạn không có quyền đăng tin tuyển dụng này.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const updated = await prisma.job.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });

    successResponse(res, updated, 200, 'Job posting is now PUBLISHED.');
  }
}
