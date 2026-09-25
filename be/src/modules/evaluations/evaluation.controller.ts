import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { EvaluationPolicy } from '../../policies/evaluation.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';

export const createEvaluationSchema = z.object({
  interviewId: z.string().uuid(),
  score: z.number().int().min(1).max(10),
  technicalNotes: z.string().min(5),
  culturalNotes: z.string().optional(),
  recommendation: z.enum(['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE']),
});

export const updateEvaluationSchema = z.object({
  score: z.number().int().min(1).max(10).optional(),
  technicalNotes: z.string().min(5).optional(),
  culturalNotes: z.string().optional(),
  recommendation: z.enum(['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE']).optional(),
});

export class EvaluationController {
  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await EvaluationPolicy.canView(user, id);
    if (!canView) {
      errorResponse(
        res,
        'Access denied. Internal evaluations are restricted to authorized reviewers and assigned interviewers.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: {
        interview: {
          include: {
            application: {
              include: {
                candidate: { select: { id: true, fullName: true, email: true } },
                job: { select: { id: true, title: true } },
              },
            },
          },
        },
        interviewer: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!evaluation) {
      errorResponse(res, 'Evaluation not found.', 404, 'NOT_FOUND');
      return;
    }

    successResponse(res, evaluation, 200);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    const user = req.user!;

    const canSubmit = await EvaluationPolicy.canSubmit(user, data.interviewId);
    if (!canSubmit) {
      errorResponse(
        res,
        'Access denied. You can only evaluate interviews assigned to you.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const evaluation = await prisma.evaluation.create({
      data: {
        interviewId: data.interviewId,
        interviewerId: user.id,
        score: data.score,
        technicalNotes: data.technicalNotes,
        culturalNotes: data.culturalNotes,
        recommendation: data.recommendation,
      },
    });

    await recordRequestAudit(req, AuditAction.EVALUATION_CREATED, 'evaluation', evaluation.id, {
      interviewId: data.interviewId,
      recommendation: data.recommendation,
    });

    successResponse(res, evaluation, 201, 'Evaluation submitted successfully.');
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await EvaluationPolicy.canView(user, id);
    if (!canView) {
      errorResponse(res, 'Access denied. You cannot modify this evaluation.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const updated = await prisma.evaluation.update({
      where: { id },
      data: req.body,
    });

    await recordRequestAudit(req, AuditAction.EVALUATION_UPDATED, 'evaluation', updated.id);

    successResponse(res, updated, 200, 'Evaluation updated successfully.');
  }
}
