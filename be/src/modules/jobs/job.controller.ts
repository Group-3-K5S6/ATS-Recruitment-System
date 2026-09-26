import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { JobPolicy } from '../../policies/job.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { RoleType } from '../../rbac/roles';

export const createJobSchema = z.object({
  title: z.string().min(3),
  requisitionId: z.string().uuid().optional(),
  departmentId: z.string().uuid(),
  hiringManagerId: z.string().uuid(),
  description: z.string().min(10),
  location: z.string().default('Hanoi'),
});

export const updateJobSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  location: z.string().optional(),
  recruiterId: z.string().uuid().optional(),
});

export class JobController {
  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    let whereClause = {};

    // Candidate can only view published job postings
    if (user.roles.includes(RoleType.CANDIDATE)) {
      whereClause = { status: 'PUBLISHED' };
    } else if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      whereClause = {
        OR: [
          { hiringManagerId: user.id },
          user.departmentId ? { departmentId: user.departmentId } : {},
        ],
      };
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        department: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        recruiter: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, jobs, 200);
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await JobPolicy.canView(user, id);
    if (!canView) {
      errorResponse(res, 'Access denied. You cannot view this job posting.', 403, 'FORBIDDEN_SCOPE');
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
      errorResponse(res, 'Job posting not found.', 404, 'NOT_FOUND');
      return;
    }

    successResponse(res, job, 200);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    const user = req.user!;

    const job = await prisma.job.create({
      data: {
        title: data.title,
        requisitionId: data.requisitionId,
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
      errorResponse(res, 'Access denied. You cannot update this job.', 403, 'FORBIDDEN_SCOPE');
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

    const updated = await prisma.job.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });

    successResponse(res, updated, 200, 'Job posting is now PUBLISHED.');
  }
}
