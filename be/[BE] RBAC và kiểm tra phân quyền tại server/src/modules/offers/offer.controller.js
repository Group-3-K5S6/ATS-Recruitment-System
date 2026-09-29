"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfferController = exports.approveOfferSchema = exports.updateOfferSchema = exports.createOfferSchema = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../../database/prisma");
const offer_policy_1 = require("../../policies/offer.policy");
const response_1 = require("../../utils/response");
const audit_logger_1 = require("../../middleware/audit-logger");
const types_1 = require("../../rbac/types");
const roles_1 = require("../../rbac/roles");
exports.createOfferSchema = zod_1.z.object({
    applicationId: zod_1.z.string().uuid(),
    approverId: zod_1.z.string().uuid().optional(),
    baseSalary: zod_1.z.number().positive(),
    internalNotes: zod_1.z.string().optional(),
});
exports.updateOfferSchema = zod_1.z.object({
    baseSalary: zod_1.z.number().positive().optional(),
    internalNotes: zod_1.z.string().optional(),
    status: zod_1.z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'ACCEPTED', 'DECLINED']).optional(),
});
exports.approveOfferSchema = zod_1.z.object({
    decision: zod_1.z.enum(['APPROVE', 'REJECT']),
    notes: zod_1.z.string().optional(),
});
class OfferController {
    static async list(req, res) {
        const user = req.user;
        // Interviewer cannot view offers
        if (user.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            (0, response_1.errorResponse)(res, 'Access denied. Interviewers cannot view offers.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        let whereClause = {};
        if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            whereClause = {
                application: {
                    candidate: {
                        userId: user.id,
                    },
                },
                status: { in: ['APPROVED', 'SENT', 'ACCEPTED', 'DECLINED'] },
            };
        }
        else if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
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
        const offers = await prisma_1.prisma.offer.findMany({
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
        const sanitizedOffers = offers.map((o) => offer_policy_1.OfferPolicy.sanitize(user, o));
        (0, response_1.successResponse)(res, sanitizedOffers, 200);
    }
    static async getById(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canView = await offer_policy_1.OfferPolicy.canView(user, id);
        if (!canView) {
            const exists = await prisma_1.prisma.offer.findUnique({ where: { id } });
            if (exists) {
                (0, response_1.errorResponse)(res, 'Access denied. You do not have permission to view this offer.', 403, 'FORBIDDEN_SCOPE');
                return;
            }
            (0, response_1.errorResponse)(res, 'Offer not found.', 404, 'NOT_FOUND');
            return;
        }
        const offer = await prisma_1.prisma.offer.findUnique({
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
        (0, response_1.successResponse)(res, offer_policy_1.OfferPolicy.sanitize(user, offer), 200);
    }
    static async create(req, res) {
        const data = req.body;
        const user = req.user;
        const canCreate = await offer_policy_1.OfferPolicy.canCreate(user);
        if (!canCreate) {
            (0, response_1.errorResponse)(res, 'Access denied. You cannot create offers.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const offer = await prisma_1.prisma.offer.create({
            data: {
                applicationId: data.applicationId,
                recruiterId: user.id,
                approverId: data.approverId,
                baseSalary: data.baseSalary,
                internalNotes: data.internalNotes,
                status: 'PENDING_APPROVAL',
            },
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.OFFER_CREATED, 'offer', offer.id, {
            applicationId: data.applicationId,
            baseSalary: data.baseSalary,
        });
        (0, response_1.successResponse)(res, offer, 201, 'Offer created and submitted for approval.');
    }
    static async update(req, res) {
        const { id } = req.params;
        const updated = await prisma_1.prisma.offer.update({
            where: { id },
            data: req.body,
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.OFFER_UPDATED, 'offer', updated.id);
        (0, response_1.successResponse)(res, updated, 200, 'Offer updated successfully.');
    }
    static async approve(req, res) {
        const { id } = req.params;
        const { decision } = req.body;
        const user = req.user;
        const canApprove = await offer_policy_1.OfferPolicy.canApprove(user, id);
        if (!canApprove) {
            (0, response_1.errorResponse)(res, 'Access denied. You are not authorized to approve this offer.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const updated = await prisma_1.prisma.offer.update({
            where: { id },
            data: { status: newStatus },
        });
        const action = decision === 'APPROVE' ? types_1.AuditAction.OFFER_APPROVED : types_1.AuditAction.OFFER_REJECTED;
        await (0, audit_logger_1.recordRequestAudit)(req, action, 'offer', updated.id, { status: newStatus });
        (0, response_1.successResponse)(res, updated, 200, `Offer has been ${newStatus.toLowerCase()}.`);
    }
}
exports.OfferController = OfferController;
