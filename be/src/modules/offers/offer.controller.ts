import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { OfferPolicy } from '../../policies/offer.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';

export const createOfferSchema = z.object({
  applicationId: z.string().uuid(),
  approverId: z.string().uuid().optional(),
  baseSalary: z.number().positive(),
  internalNotes: z.string().optional(),
});

export const updateOfferSchema = z.object({
  baseSalary: z.number().positive().optional(),
  internalNotes: z.string().optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'ACCEPTED', 'DECLINED']).optional(),
});

export const approveOfferSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().optional(),
});

async function getSalaryBandForApplication(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: { include: { jobTitle: true } } },
  });
  if (!application) return { error: 'Không tìm thấy hồ sơ ứng tuyển.', status: 404 } as const;
  if (!application.job.jobTitle) {
    return { error: 'Tin tuyển dụng chưa được gắn chức danh có dải lương.', status: 409 } as const;
  }
  return { band: application.job.jobTitle } as const;
}

function salaryWithinBand(salary: number, band: { minSalary: number; maxSalary: number }): boolean {
  return salary >= band.minSalary && salary <= band.maxSalary;
}

export class OfferController {
  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    // Interviewer cannot view offers
    if (user.roles.includes(RoleType.INTERVIEWER)) {
      errorResponse(res, 'Access denied. Interviewers cannot view offers.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    let whereClause = {};

    if (user.roles.includes(RoleType.CANDIDATE)) {
      whereClause = {
        application: {
          candidate: {
            userId: user.id,
          },
        },
        status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'DECLINED'] },
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

    const offers = await prisma.offer.findMany({
      where: whereClause,
      include: {
        application: {
          include: {
            candidate: { select: { id: true, fullName: true, email: true } },
            job: { select: { id: true, title: true, departmentId: true } },
          },
        },
        recruiter: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sanitizedOffers = offers.map((o) => OfferPolicy.sanitize(user, o));
    successResponse(res, sanitizedOffers, 200);
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await OfferPolicy.canView(user, id);
    if (!canView) {
      const exists = await prisma.offer.findUnique({ where: { id } });
      if (exists) {
        errorResponse(
          res,
          'Access denied. You do not have permission to view this offer.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Offer not found.', 404, 'NOT_FOUND');
      return;
    }

    const offer = await prisma.offer.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            candidate: { select: { id: true, fullName: true, email: true } },
            job: true,
          },
        },
        recruiter: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true, email: true } },
      },
    });

    successResponse(res, OfferPolicy.sanitize(user, offer), 200);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    const user = req.user!;

    const canCreate = await OfferPolicy.canCreate(user);
    if (!canCreate) {
      errorResponse(res, 'Access denied. You cannot create offers.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    const salaryBand = await getSalaryBandForApplication(data.applicationId);
    if ('error' in salaryBand && salaryBand.error) {
      errorResponse(res, salaryBand.error, salaryBand.status, 'SALARY_BAND_REQUIRED');
      return;
    }
    if (!salaryWithinBand(data.baseSalary, salaryBand.band)) {
      errorResponse(res, 'Mức lương offer nằm ngoài dải được phép cho chức danh này.', 400, 'SALARY_OUT_OF_RANGE');
      return;
    }

    const offer = await prisma.offer.create({
      data: {
        applicationId: data.applicationId,
        recruiterId: user.id,
        approverId: data.approverId,
        baseSalary: data.baseSalary,
        internalNotes: data.internalNotes,
        status: 'PENDING_APPROVAL',
      },
    });

    await recordRequestAudit(req, AuditAction.OFFER_CREATED, 'offer', offer.id, {
      applicationId: data.applicationId,
      baseSalary: data.baseSalary,
    });

    successResponse(res, offer, 201, 'Offer created and submitted for approval.');
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const existing = await prisma.offer.findUnique({
      where: { id },
      include: { application: { include: { job: { include: { jobTitle: true } } } } },
    });
    if (!existing) {
      errorResponse(res, 'Offer not found.', 404, 'NOT_FOUND');
      return;
    }
    const mustCheckSalary = req.body.baseSalary !== undefined || ['PENDING_APPROVAL', 'APPROVED'].includes(req.body.status);
    if (mustCheckSalary) {
      const band = existing.application.job.jobTitle;
      if (!band) {
        errorResponse(res, 'Tin tuyển dụng chưa được gắn chức danh có dải lương.', 409, 'SALARY_BAND_REQUIRED');
        return;
      }
      if (!salaryWithinBand(req.body.baseSalary ?? existing.baseSalary, band)) {
        errorResponse(res, 'Mức lương offer nằm ngoài dải được phép cho chức danh này.', 400, 'SALARY_OUT_OF_RANGE');
        return;
      }
    }

    const updated = await prisma.offer.update({
      where: { id },
      data: req.body,
    });

    await recordRequestAudit(req, AuditAction.OFFER_UPDATED, 'offer', updated.id);

    successResponse(res, updated, 200, 'Offer updated successfully.');
  }

  static async approve(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { decision } = req.body;
    const user = req.user!;

    const canApprove = await OfferPolicy.canApprove(user, id);
    if (!canApprove) {
      errorResponse(res, 'Access denied. You are not authorized to approve this offer.', 403, 'FORBIDDEN_SCOPE');
      return;
    }

    const offerForApproval = await prisma.offer.findUnique({
      where: { id },
      include: { application: { include: { job: { include: { jobTitle: true } } } } },
    });
    if (!offerForApproval) {
      errorResponse(res, 'Offer not found.', 404, 'NOT_FOUND');
      return;
    }
    const band = offerForApproval.application.job.jobTitle;
    if (!band) {
      errorResponse(res, 'Tin tuyển dụng chưa được gắn chức danh có dải lương.', 409, 'SALARY_BAND_REQUIRED');
      return;
    }
    if (decision === 'APPROVE' && !salaryWithinBand(offerForApproval.baseSalary, band)) {
      errorResponse(res, 'Không thể duyệt offer nằm ngoài dải được phép cho chức danh này.', 400, 'SALARY_OUT_OF_RANGE');
      return;
    }

    const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await prisma.offer.update({
      where: { id },
      data: { status: newStatus },
    });

    const action = decision === 'APPROVE' ? AuditAction.OFFER_APPROVED : AuditAction.OFFER_REJECTED;
    await recordRequestAudit(req, action, 'offer', updated.id, { status: newStatus });

    successResponse(res, updated, 200, `Offer has been ${newStatus.toLowerCase()}.`);
  }
}
