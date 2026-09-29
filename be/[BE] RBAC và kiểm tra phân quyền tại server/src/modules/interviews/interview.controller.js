"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterviewController = exports.updateInterviewSchema = exports.createInterviewSchema = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../../database/prisma");
const interview_policy_1 = require("../../policies/interview.policy");
const response_1 = require("../../utils/response");
const audit_logger_1 = require("../../middleware/audit-logger");
const types_1 = require("../../rbac/types");
const roles_1 = require("../../rbac/roles");
exports.createInterviewSchema = zod_1.z.object({
    applicationId: zod_1.z.string().uuid(),
    interviewerId: zod_1.z.string().uuid(),
    scheduledAt: zod_1.z.string().datetime(),
    durationMinutes: zod_1.z.number().int().positive().default(60),
    meetingLink: zod_1.z.string().url().optional(),
});
exports.updateInterviewSchema = zod_1.z.object({
    scheduledAt: zod_1.z.string().datetime().optional(),
    durationMinutes: zod_1.z.number().int().positive().optional(),
    status: zod_1.z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
    meetingLink: zod_1.z.string().url().optional(),
});
class InterviewController {
    static async list(req, res) {
        const user = req.user;
        let whereClause = {};
        if (user.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            whereClause = { interviewerId: user.id };
        }
        else if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            whereClause = {
                application: {
                    candidate: {
                        userId: user.id,
                    },
                },
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
        const interviews = await prisma_1.prisma.interview.findMany({
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
        (0, response_1.successResponse)(res, interviews, 200);
    }
    static async getById(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canView = await interview_policy_1.InterviewPolicy.canView(user, id);
        if (!canView) {
            const exists = await prisma_1.prisma.interview.findUnique({ where: { id } });
            if (exists) {
                (0, response_1.errorResponse)(res, 'Access denied. You are not assigned to or authorized for this interview.', 403, 'FORBIDDEN_SCOPE');
                return;
            }
            (0, response_1.errorResponse)(res, 'Interview not found.', 404, 'NOT_FOUND');
            return;
        }
        const interview = await prisma_1.prisma.interview.findUnique({
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
        (0, response_1.successResponse)(res, interview, 200);
    }
    static async create(req, res) {
        const data = req.body;
        const interview = await prisma_1.prisma.interview.create({
            data: {
                applicationId: data.applicationId,
                interviewerId: data.interviewerId,
                scheduledAt: new Date(data.scheduledAt),
                durationMinutes: data.durationMinutes,
                meetingLink: data.meetingLink,
                status: 'SCHEDULED',
            },
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.INTERVIEW_CREATED, 'interview', interview.id, {
            scheduledAt: interview.scheduledAt,
            interviewerId: interview.interviewerId,
        });
        (0, response_1.successResponse)(res, interview, 201, 'Interview scheduled successfully.');
    }
    static async update(req, res) {
        const { id } = req.params;
        const data = req.body;
        const updated = await prisma_1.prisma.interview.update({
            where: { id },
            data: {
                ...data,
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
            },
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.INTERVIEW_UPDATED, 'interview', updated.id, {
            status: updated.status,
        });
        (0, response_1.successResponse)(res, updated, 200, 'Interview updated successfully.');
    }
}
exports.InterviewController = InterviewController;
