"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequisitionController = exports.approveRequisitionSchema = exports.updateRequisitionSchema = exports.createRequisitionSchema = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../../database/prisma");
const requisition_policy_1 = require("../../policies/requisition.policy");
const response_1 = require("../../utils/response");
const audit_logger_1 = require("../../middleware/audit-logger");
const types_1 = require("../../rbac/types");
const roles_1 = require("../../rbac/roles");
exports.createRequisitionSchema = zod_1.z.object({
    title: zod_1.z.string().min(3),
    departmentId: zod_1.z.string().uuid(),
    headcount: zod_1.z.number().int().positive().default(1),
    budget: zod_1.z.number().positive().optional(),
    approverId: zod_1.z.string().uuid().optional(),
});
exports.updateRequisitionSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).optional(),
    headcount: zod_1.z.number().int().positive().optional(),
    budget: zod_1.z.number().positive().optional(),
    approverId: zod_1.z.string().uuid().optional(),
});
exports.approveRequisitionSchema = zod_1.z.object({
    decision: zod_1.z.enum(['APPROVE', 'REJECT']),
    notes: zod_1.z.string().optional(),
});
class RequisitionController {
    static async list(req, res) {
        const user = req.user;
        let whereClause = {};
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            whereClause = {
                OR: [
                    { hiringManagerId: user.id },
                    user.departmentId ? { departmentId: user.departmentId } : {},
                ],
            };
        }
        const requisitions = await prisma_1.prisma.requisition.findMany({
            where: whereClause,
            include: {
                department: true,
                hiringManager: { select: { id: true, fullName: true, email: true } },
                approver: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        (0, response_1.successResponse)(res, requisitions, 200);
    }
    static async getById(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canView = await requisition_policy_1.RequisitionPolicy.canView(user, id);
        if (!canView) {
            const exists = await prisma_1.prisma.requisition.findUnique({ where: { id } });
            if (exists) {
                (0, response_1.errorResponse)(res, 'Access denied. Requisition is outside your department or assigned scope.', 403, 'FORBIDDEN_SCOPE');
                return;
            }
            (0, response_1.errorResponse)(res, 'Requisition not found.', 404, 'NOT_FOUND');
            return;
        }
        const requisition = await prisma_1.prisma.requisition.findUnique({
            where: { id },
            include: {
                department: true,
                hiringManager: { select: { id: true, fullName: true, email: true } },
                approver: { select: { id: true, fullName: true, email: true } },
                jobs: true,
            },
        });
        (0, response_1.successResponse)(res, requisition, 200);
    }
    static async create(req, res) {
        const data = req.body;
        const user = req.user;
        const canCreate = await requisition_policy_1.RequisitionPolicy.canCreate(user, data.departmentId);
        if (!canCreate) {
            (0, response_1.errorResponse)(res, 'Access denied. Hiring managers can only create recruitment requests for their own department.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const requisition = await prisma_1.prisma.requisition.create({
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
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.REQUISITION_CREATED, 'requisition', requisition.id, {
            title: requisition.title,
            departmentId: requisition.departmentId,
        });
        (0, response_1.successResponse)(res, requisition, 201, 'Requisition submitted for approval.');
    }
    static async update(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canUpdate = await requisition_policy_1.RequisitionPolicy.canUpdate(user, id);
        if (!canUpdate) {
            (0, response_1.errorResponse)(res, 'Access denied. You cannot modify requisitions outside your scope.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const updated = await prisma_1.prisma.requisition.update({
            where: { id },
            data: req.body,
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.REQUISITION_UPDATED, 'requisition', updated.id);
        (0, response_1.successResponse)(res, updated, 200, 'Requisition updated successfully.');
    }
    static async approve(req, res) {
        const { id } = req.params;
        const { decision } = req.body;
        const user = req.user;
        const canApprove = await requisition_policy_1.RequisitionPolicy.canApprove(user, id);
        if (!canApprove) {
            (0, response_1.errorResponse)(res, 'Access denied. You do not have approval authorization for this requisition.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const updated = await prisma_1.prisma.requisition.update({
            where: { id },
            data: { status: newStatus },
        });
        const action = decision === 'APPROVE'
            ? types_1.AuditAction.REQUISITION_APPROVED
            : types_1.AuditAction.REQUISITION_REJECTED;
        await (0, audit_logger_1.recordRequestAudit)(req, action, 'requisition', updated.id, {
            status: newStatus,
        });
        (0, response_1.successResponse)(res, updated, 200, `Requisition has been ${newStatus.toLowerCase()}.`);
    }
}
exports.RequisitionController = RequisitionController;
