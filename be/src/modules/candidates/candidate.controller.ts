import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import {
  CandidateService,
  generateTrackingCode,
  generateUniqueTrackingCode,
  registerTrackingCode,
} from './candidate.service';
import { sendApplicationTrackingEmail } from '../../utils/email';
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

export const trackStatusSchema = z.object({
  trackingCode: z
    .string({ required_error: 'Mã tra cứu là bắt buộc' })
    .trim()
    .min(5, 'Mã tra cứu không hợp lệ')
    .max(100, 'Mã tra cứu quá dài')
    .regex(/^ATS-[A-Za-z0-9_-]+$/, 'Mã tra cứu không đúng định dạng (ví dụ: ATS-XXXXXXX)'),
  email: z
    .string({ required_error: 'Email là bắt buộc' })
    .trim()
    .email('Email không đúng định dạng')
    .max(254, 'Email quá dài')
    .toLowerCase(),
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

    let trackingCode: string | undefined;
    if (data.jobId) {
      trackingCode = await generateUniqueTrackingCode();
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
        applications: data.jobId && trackingCode
          ? {
              create: {
                jobId: data.jobId,
                stage: 'APPLIED',
                status: 'ACTIVE',
                trackingCode,
              },
            }
          : undefined,
      },
      include: {
        applications: {
          include: {
            job: {
              select: { title: true },
            },
          },
        },
      },
    });

    // Send email with trackingCode to candidate if an application was created
    if (candidate.applications?.length && trackingCode) {
      registerTrackingCode(trackingCode, candidate.applications[0].id);
      const jobTitle = candidate.applications[0].job?.title;
      try {
        await sendApplicationTrackingEmail(
          candidate.email,
          candidate.fullName,
          trackingCode,
          jobTitle
        );
      } catch (emailError: any) {
        const maskedEmail =
          candidate.email.split('@')[0].slice(0, 2) +
          '***@' +
          (candidate.email.split('@')[1] || '');
        console.error(
          `[CandidateController.create] Failed to send tracking email to ${maskedEmail}:`,
          emailError?.message || 'Unknown error'
        );
      }
    }

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

    const canDelete = await CandidatePolicy.canDelete(user, id);
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

  /**
   * GET /api/candidates/:id/profile
   * Unified candidate profile: personal info + full application history
   * (job details, interview schedule, evaluations, offers) scoped by role.
   */
  static async getUnifiedProfile(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const profile = await CandidateService.getUnifiedProfile(id, user);

    if (!profile) {
      // Differentiate 403 vs 404 without leaking existence to unauthorised users
      const exists = await prisma.candidate.findUnique({ where: { id }, select: { id: true } });
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

    await recordRequestAudit(req, AuditAction.CANDIDATE_VIEWED, 'candidate', profile.id, {
      actionType: 'UNIFIED_PROFILE_VIEW',
    });

    successResponse(res, profile, 200);
  }

  /**
   * POST /api/candidates/track-status
   * Public tracking endpoint: Lookup candidate application status using trackingCode and email.
   * No authentication required. No internal notes or PII leaked.
   */
  static async trackStatus(req: Request, res: Response): Promise<void> {
    try {
      const { trackingCode, email } = req.body;

      const result = await CandidateService.trackApplicationStatus(trackingCode, email);

      if (!result) {
        // Generic message without revealing whether code or email exists
        errorResponse(res, 'Không tìm thấy hồ sơ phù hợp.', 404, 'NOT_FOUND');
        return;
      }

      successResponse(res, result, 200);
    } catch (error: any) {
      console.error('[CandidateController.trackStatus] Internal error:', error?.message || error);
      errorResponse(res, 'Đã xảy ra lỗi hệ thống khi tra cứu hồ sơ.', 500, 'INTERNAL_SERVER_ERROR');
    }
  }
}
