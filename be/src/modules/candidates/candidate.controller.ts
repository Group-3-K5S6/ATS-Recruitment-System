import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { CandidateService } from './candidate.service';
import { CandidatePolicy } from '../../policies/candidate.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';

export const createCandidateSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  cvUrl: z.string().url().optional(),
  address: z.string().optional(),
  expectedSalary: z.number().positive().optional(),
  currentCompany: z.string().optional(),
  jobId: z.string().optional(),
});

export const updateCandidateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  cvUrl: z.string().url().optional(),
  address: z.string().optional(),
  expectedSalary: z.number().positive().optional(),
  currentCompany: z.string().optional(),
});

export class CandidateController {
  static async list(req: Request, res: Response): Promise<void> {
    const candidates = await CandidateService.listCandidatesForUser(req.user!);
    successResponse(res, candidates, 200);
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    // Scoped query filter directly at database layer to prevent IDOR
    const candidate = await CandidateService.findCandidateForUser(id, req.user!);

    if (!candidate) {
      // Check if candidate actually exists to differentiate 403 vs 404 securely
      const exists = await prisma.candidate.findUnique({ where: { id } });
      if (exists) {
        errorResponse(
          res,
          'Access denied. You do not have permission to access this candidate profile.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Candidate not found.', 404, 'NOT_FOUND');
      return;
    }

    await recordRequestAudit(req, AuditAction.CANDIDATE_VIEWED, 'candidate', candidate.id);

    successResponse(res, candidate, 200);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    const user = req.user!;

    // Prevent client identity spoofing: if user is CANDIDATE, force userId = user.id
    const targetUserId = user.roles.includes(RoleType.CANDIDATE) ? user.id : undefined;

    if (targetUserId) {
      const existing = await prisma.candidate.findUnique({ where: { userId: targetUserId } });
      if (existing) {
        const updated = await prisma.candidate.update({
          where: { id: existing.id },
          data: {
            fullName: data.fullName || existing.fullName,
            phone: data.phone ?? existing.phone,
            cvUrl: data.cvUrl ?? existing.cvUrl,
            address: data.address ?? existing.address,
            expectedSalary: data.expectedSalary ?? existing.expectedSalary,
            currentCompany: data.currentCompany ?? existing.currentCompany,
          },
        });
        await recordRequestAudit(req, AuditAction.CANDIDATE_UPDATED, 'candidate', updated.id);
        successResponse(res, CandidatePolicy.sanitize(user, updated), 200, 'Candidate profile updated');
        return;
      }
    }

    const candidate = await prisma.candidate.create({
      data: {
        fullName: data.fullName,
        email: user.roles.includes(RoleType.CANDIDATE) ? user.email : data.email,
        phone: data.phone,
        cvUrl: data.cvUrl,
        address: data.address,
        expectedSalary: data.expectedSalary,
        currentCompany: data.currentCompany,
        userId: targetUserId,
        applications: data.jobId
          ? {
              create: {
                jobId: data.jobId,
                stage: 'APPLIED',
                status: 'ACTIVE',
              },
            }
          : undefined,
      },
    });

    await recordRequestAudit(req, AuditAction.CANDIDATE_CREATED, 'candidate', candidate.id);

    successResponse(res, CandidatePolicy.sanitize(user, candidate), 201, 'Candidate created successfully');
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canUpdate = await CandidatePolicy.canUpdate(user, id);
    if (!canUpdate) {
      errorResponse(
        res,
        'Access denied. You cannot modify this candidate profile.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const updated = await prisma.candidate.update({
      where: { id },
      data: req.body,
    });

    await recordRequestAudit(req, AuditAction.CANDIDATE_UPDATED, 'candidate', updated.id);

    successResponse(res, CandidatePolicy.sanitize(user, updated), 200, 'Candidate updated successfully');
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canDelete = await CandidatePolicy.canDelete(user);
    if (!canDelete) {
      errorResponse(res, 'Access denied. You cannot delete candidate records.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    await prisma.candidate.delete({ where: { id } });

    await recordRequestAudit(req, AuditAction.CANDIDATE_DELETED, 'candidate', id);

    successResponse(res, { message: 'Candidate deleted successfully' }, 200);
  }

  /**
   * Endpoint to securely download/view candidate CV with full server-side authorization check
   */
  static async getCv(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const candidate = await CandidateService.findCandidateForUser(id, user);
    if (!candidate) {
      errorResponse(
        res,
        'Access denied. You do not have permission to view or download this candidate CV.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    if (!candidate.cvUrl) {
      errorResponse(res, 'Candidate does not have a CV uploaded.', 404, 'CV_NOT_FOUND');
      return;
    }

    await recordRequestAudit(req, AuditAction.CANDIDATE_VIEWED, 'candidate', candidate.id, {
      actionType: 'CV_DOWNLOAD',
    });

    successResponse(res, { cvUrl: candidate.cvUrl }, 200);
  }
}
