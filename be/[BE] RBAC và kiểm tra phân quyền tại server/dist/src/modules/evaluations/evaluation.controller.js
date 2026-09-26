"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvaluationController = exports.updateEvaluationSchema = exports.createEvaluationSchema = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../../database/prisma");
const evaluation_policy_1 = require("../../policies/evaluation.policy");
const response_1 = require("../../utils/response");
const audit_logger_1 = require("../../middleware/audit-logger");
const types_1 = require("../../rbac/types");
exports.createEvaluationSchema = zod_1.z.object({
    interviewId: zod_1.z.string().uuid(),
    score: zod_1.z.number().int().min(1).max(10),
    technicalNotes: zod_1.z.string().min(5),
    culturalNotes: zod_1.z.string().optional(),
    recommendation: zod_1.z.enum(['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE']),
});
exports.updateEvaluationSchema = zod_1.z.object({
    score: zod_1.z.number().int().min(1).max(10).optional(),
    technicalNotes: zod_1.z.string().min(5).optional(),
    culturalNotes: zod_1.z.string().optional(),
    recommendation: zod_1.z.enum(['STRONG_HIRE', 'HIRE', 'NO_HIRE', 'STRONG_NO_HIRE']).optional(),
});
class EvaluationController {
    static async getById(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canView = await evaluation_policy_1.EvaluationPolicy.canView(user, id);
        if (!canView) {
            (0, response_1.errorResponse)(res, 'Access denied. Internal evaluations are restricted to authorized reviewers and assigned interviewers.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const evaluation = await prisma_1.prisma.evaluation.findUnique({
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
            (0, response_1.errorResponse)(res, 'Evaluation not found.', 404, 'NOT_FOUND');
            return;
        }
        (0, response_1.successResponse)(res, evaluation, 200);
    }
    static async create(req, res) {
        const data = req.body;
        const user = req.user;
        const canSubmit = await evaluation_policy_1.EvaluationPolicy.canSubmit(user, data.interviewId);
        if (!canSubmit) {
            (0, response_1.errorResponse)(res, 'Access denied. You can only evaluate interviews assigned to you.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const evaluation = await prisma_1.prisma.evaluation.create({
            data: {
                interviewId: data.interviewId,
                interviewerId: user.id,
                score: data.score,
                technicalNotes: data.technicalNotes,
                culturalNotes: data.culturalNotes,
                recommendation: data.recommendation,
            },
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.EVALUATION_CREATED, 'evaluation', evaluation.id, {
            interviewId: data.interviewId,
            recommendation: data.recommendation,
        });
        (0, response_1.successResponse)(res, evaluation, 201, 'Evaluation submitted successfully.');
    }
    static async update(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canView = await evaluation_policy_1.EvaluationPolicy.canView(user, id);
        if (!canView) {
            (0, response_1.errorResponse)(res, 'Access denied. You cannot modify this evaluation.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const updated = await prisma_1.prisma.evaluation.update({
            where: { id },
            data: req.body,
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.EVALUATION_UPDATED, 'evaluation', updated.id);
        (0, response_1.successResponse)(res, updated, 200, 'Evaluation updated successfully.');
    }
}
exports.EvaluationController = EvaluationController;
