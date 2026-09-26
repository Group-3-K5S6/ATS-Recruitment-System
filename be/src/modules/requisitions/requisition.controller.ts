import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { RequisitionPolicy } from '../../policies/requisition.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';

export const createRequisitionSchema = z.object({
  title: z.string().min(3),
  departmentId: z.string().uuid(),
  headcount: z.number().int().positive().default(1),
  budget: z.number().positive().optional(),
  approverId: z.string().uuid().optional(),
});

export const updateRequisitionSchema = z.object({
  title: z.string().min(3).optional(),
  headcount: z.number().int().positive().optional(),
  budget: z.number().positive().optional(),
  approverId: z.string().uuid().optional(),
});

export const approveRequisitionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().optional(),
});

export class RequisitionController {
  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    let whereClause = {};
    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      whereClause = {
        OR: [
          { hiringManagerId: user.id },
          user.departmentId ? { departmentId: user.departmentId } : {},
        ],
      };
    }

    const requisitions = await prisma.requisition.findMany({
      where: whereClause,
      include: {
        department: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, requisitions, 200);
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canView = await RequisitionPolicy.canView(user, id);
    if (!canView) {
      const exists = await prisma.requisition.findUnique({ where: { id } });
      if (exists) {
        errorResponse(
          res,
          'Access denied. Requisition is outside your department or assigned scope.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Requisition not found.', 404, 'NOT_FOUND');
      return;
    }

    const requisition = await prisma.requisition.findUnique({
      where: { id },
      include: {
        department: true,
        hiringManager: { select: { id: true, fullName: true, email: true } },
        approver: { select: { id: true, fullName: true, email: true } },
        jobs: true,
      },
    });

    successResponse(res, requisition, 200);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    const user = req.user!;

    const canCreate = await RequisitionPolicy.canCreate(user, data.departmentId);
    if (!canCreate) {
      errorResponse(
        res,
        'Access denied. Hiring managers can only create recruitment requests for their own department.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const requisition = await prisma.requisition.create({
      data: {
        title: data.title,
        departmentId: data.departmentId,
        hiringManagerId: user.id,
        headcount: data.headcount,
        budget: data.budget,
        approverId: data.approverId,
        status: 'PENDING_APPROVAL',
      },
    });

    await recordRequestAudit(req, AuditAction.REQUISITION_CREATED, 'requisition', requisition.id, {
      title: requisition.title,
      departmentId: requisition.departmentId,
    });

    successResponse(res, requisition, 201, 'Requisition submitted for approval.');
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canUpdate = await RequisitionPolicy.canUpdate(user, id);
    if (!canUpdate) {
      errorResponse(
        res,
        'Access denied. You cannot modify requisitions outside your scope.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const updated = await prisma.requisition.update({
      where: { id },
      data: req.body,
    });

    await recordRequestAudit(req, AuditAction.REQUISITION_UPDATED, 'requisition', updated.id);

    successResponse(res, updated, 200, 'Requisition updated successfully.');
  }

  static async approve(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { decision } = req.body;
    const user = req.user!;

    const canApprove = await RequisitionPolicy.canApprove(user, id);
    if (!canApprove) {
      errorResponse(
        res,
        'Access denied. You do not have approval authorization for this requisition.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await prisma.requisition.update({
      where: { id },
      data: { status: newStatus },
    });

    const action =
      decision === 'APPROVE'
        ? AuditAction.REQUISITION_APPROVED
        : AuditAction.REQUISITION_REJECTED;

    await recordRequestAudit(req, action, 'requisition', updated.id, {
      status: newStatus,
    });

    successResponse(res, updated, 200, `Requisition has been ${newStatus.toLowerCase()}.`);
  }
}
