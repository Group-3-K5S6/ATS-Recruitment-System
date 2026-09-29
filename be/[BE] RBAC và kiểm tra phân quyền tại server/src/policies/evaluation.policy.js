"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvaluationPolicy = void 0;
const roles_1 = require("../rbac/roles");
const prisma_1 = require("../database/prisma");
class EvaluationPolicy {
    static async canView(user, evaluationId) {
        // Candidates are NEVER allowed to view evaluation notes
        if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            return false;
        }
        if (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER) ||
            user.roles.includes(roles_1.RoleType.APPROVER)) {
            return true;
        }
        const evaluation = await prisma_1.prisma.evaluation.findUnique({
            where: { id: evaluationId },
            include: {
                interview: {
                    include: {
                        application: {
                            include: { job: true },
                        },
                    },
                },
            },
        });
        if (!evaluation)
            return false;
        // Interviewer can view their own evaluation
        if (user.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            return evaluation.interviewerId === user.id;
        }
        // Hiring Manager can view evaluation for jobs in their department
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            const job = evaluation.interview.application.job;
            return (job.hiringManagerId === user.id ||
                (!!user.departmentId && job.departmentId === user.departmentId));
        }
        return false;
    }
    static async canSubmit(user, interviewId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) || user.roles.includes(roles_1.RoleType.HR_MANAGER)) {
            return true;
        }
        if (user.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            const interview = await prisma_1.prisma.interview.findUnique({
                where: { id: interviewId },
            });
            return interview?.interviewerId === user.id;
        }
        return false;
    }
}
exports.EvaluationPolicy = EvaluationPolicy;
