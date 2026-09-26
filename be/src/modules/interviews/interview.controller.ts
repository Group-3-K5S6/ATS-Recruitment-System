import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { InterviewPolicy } from '../../policies/interview.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';

export const createInterviewSchema = z.object({
  applicationId: z.string().uuid(),
  interviewerId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().default(60),
  meetingLink: z.string().url().optional(),
});

export const updateInterviewSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
  meetingLink: z.string().url().optional(),
});

export class InterviewController {
  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    let whereClause = {};

    if (user.roles.includes(RoleType.INTERVIEWER)) {
      whereClause = { interviewerId: user.id };
    } else if (user.roles.includes(RoleType.CANDIDATE)) {
      whereClause = {
        application: {
          candidate: {
            userId: user.id,
          },
        },
      };
    } else if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      whereClause = {
        application: {
          job: {
            OR: [
              { hiringManagerId: user.id },
              user.departmentId ? { departmentId: user.departmentId } : {},
            ],
          },
        },
      };
    }

    const interviews = await prisma.interview.findMany({
      where: whereClause,
      include: {
        application: {
          include: {
            candidate: {
              select: {
                id: true,
                fullName: true,
                email: true,
                cvUrl: true,
              },
            },
            job: {
              select: {
                id: true,
                title: true,
                departmentId: true,
              },
            },
          },
        },
        interviewer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    successResponse(res, interviews, 200);
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await InterviewPolicy.canView(user, id);
    if (!canView) {
      const exists = await prisma.interview.findUnique({ where: { id } });
      if (exists) {
        errorResponse(
          res,
          'Access denied. You are not assigned to or authorized for this interview.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Interview not found.', 404, 'NOT_FOUND');
      return;
    }

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            candidate: {
              select: {
                id: true,
                fullName: true,
                email: true,
                cvUrl: true,
              },
            },
            job: true,
          },
        },
        interviewer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    successResponse(res, interview, 200);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;

    const interview = await prisma.interview.create({
      data: {
        applicationId: data.applicationId,
        interviewerId: data.interviewerId,
        scheduledAt: new Date(data.scheduledAt),
        durationMinutes: data.durationMinutes,
        meetingLink: data.meetingLink,
        status: 'SCHEDULED',
      },
    });

    await recordRequestAudit(req, AuditAction.INTERVIEW_CREATED, 'interview', interview.id, {
      scheduledAt: interview.scheduledAt,
      interviewerId: interview.interviewerId,
    });

    successResponse(res, interview, 201, 'Interview scheduled successfully.');
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const data = req.body;

    const updated = await prisma.interview.update({
      where: { id },
      data: {
        ...data,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      },
    });

    await recordRequestAudit(req, AuditAction.INTERVIEW_UPDATED, 'interview', updated.id, {
      status: updated.status,
    });

    successResponse(res, updated, 200, 'Interview updated successfully.');
  }
}
