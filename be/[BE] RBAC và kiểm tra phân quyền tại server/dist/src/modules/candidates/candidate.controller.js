"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CandidateController = exports.updateCandidateSchema = exports.createCandidateSchema = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../../database/prisma");
const candidate_service_1 = require("./candidate.service");
const candidate_policy_1 = require("../../policies/candidate.policy");
const response_1 = require("../../utils/response");
const audit_logger_1 = require("../../middleware/audit-logger");
const types_1 = require("../../rbac/types");
const roles_1 = require("../../rbac/roles");
exports.createCandidateSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    phone: zod_1.z.string().optional(),
    cvUrl: zod_1.z.string().url().optional(),
    address: zod_1.z.string().optional(),
    expectedSalary: zod_1.z.number().positive().optional(),
    currentCompany: zod_1.z.string().optional(),
    jobId: zod_1.z.string().optional(),
});
exports.updateCandidateSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2).optional(),
    phone: zod_1.z.string().optional(),
    cvUrl: zod_1.z.string().url().optional(),
    address: zod_1.z.string().optional(),
    expectedSalary: zod_1.z.number().positive().optional(),
    currentCompany: zod_1.z.string().optional(),
});
class CandidateController {
    static async list(req, res) {
        const candidates = await candidate_service_1.CandidateService.listCandidatesForUser(req.user);
        (0, response_1.successResponse)(res, candidates, 200);
    }
    static async getById(req, res) {
        const { id } = req.params;
        // Scoped query filter directly at database layer to prevent IDOR
        const candidate = await candidate_service_1.CandidateService.findCandidateForUser(id, req.user);
        if (!candidate) {
            // Check if candidate actually exists to differentiate 403 vs 404 securely
            const exists = await prisma_1.prisma.candidate.findUnique({ where: { id } });
            if (exists) {
                (0, response_1.errorResponse)(res, 'Access denied. You do not have permission to access this candidate profile.', 403, 'FORBIDDEN_SCOPE');
                return;
            }
            (0, response_1.errorResponse)(res, 'Candidate not found.', 404, 'NOT_FOUND');
            return;
        }
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.CANDIDATE_VIEWED, 'candidate', candidate.id);
        (0, response_1.successResponse)(res, candidate, 200);
    }
    static async create(req, res) {
        const data = req.body;
        const user = req.user;
        // Prevent client identity spoofing: if user is CANDIDATE, force userId = user.id
        const targetUserId = user.roles.includes(roles_1.RoleType.CANDIDATE) ? user.id : undefined;
        if (targetUserId) {
            const existing = await prisma_1.prisma.candidate.findUnique({ where: { userId: targetUserId } });
            if (existing) {
                const updated = await prisma_1.prisma.candidate.update({
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
                await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.CANDIDATE_UPDATED, 'candidate', updated.id);
                (0, response_1.successResponse)(res, candidate_policy_1.CandidatePolicy.sanitize(user, updated), 200, 'Candidate profile updated');
                return;
            }
        }
        const candidate = await prisma_1.prisma.candidate.create({
            data: {
                fullName: data.fullName,
                email: user.roles.includes(roles_1.RoleType.CANDIDATE) ? user.email : data.email,
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
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.CANDIDATE_CREATED, 'candidate', candidate.id);
        (0, response_1.successResponse)(res, candidate_policy_1.CandidatePolicy.sanitize(user, candidate), 201, 'Candidate created successfully');
    }
    static async update(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canUpdate = await candidate_policy_1.CandidatePolicy.canUpdate(user, id);
        if (!canUpdate) {
            (0, response_1.errorResponse)(res, 'Access denied. You cannot modify this candidate profile.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const updated = await prisma_1.prisma.candidate.update({
            where: { id },
            data: req.body,
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.CANDIDATE_UPDATED, 'candidate', updated.id);
        (0, response_1.successResponse)(res, candidate_policy_1.CandidatePolicy.sanitize(user, updated), 200, 'Candidate updated successfully');
    }
    static async delete(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canDelete = await candidate_policy_1.CandidatePolicy.canDelete(user);
        if (!canDelete) {
            (0, response_1.errorResponse)(res, 'Access denied. You cannot delete candidate records.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        await prisma_1.prisma.candidate.delete({ where: { id } });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.CANDIDATE_DELETED, 'candidate', id);
        (0, response_1.successResponse)(res, { message: 'Candidate deleted successfully' }, 200);
    }
    /**
     * Endpoint to securely download/view candidate CV with full server-side authorization check
     */
    static async getCv(req, res) {
        const { id } = req.params;
        const user = req.user;
        const candidate = await candidate_service_1.CandidateService.findCandidateForUser(id, user);
        if (!candidate) {
            (0, response_1.errorResponse)(res, 'Access denied. You do not have permission to view or download this candidate CV.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        if (!candidate.cvUrl) {
            (0, response_1.errorResponse)(res, 'Candidate does not have a CV uploaded.', 404, 'CV_NOT_FOUND');
            return;
        }
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.CANDIDATE_VIEWED, 'candidate', candidate.id, {
            actionType: 'CV_DOWNLOAD',
        });
        (0, response_1.successResponse)(res, { cvUrl: candidate.cvUrl }, 200);
    }
}
exports.CandidateController = CandidateController;
