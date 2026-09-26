"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterviewPolicy = void 0;
const roles_1 = require("../rbac/roles");
const prisma_1 = require("../database/prisma");
class InterviewPolicy {
    static async canView(user, interviewId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER)) {
            return true;
        }
        const interview = await prisma_1.prisma.interview.findUnique({
            where: { id: interviewId },
            include: {
                application: {
                    include: {
                        candidate: true,
                        job: true,
                    },
                },
            },
        });
        if (!interview)
            return false;
        // Interviewer: only their own interview
        if (user.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            return interview.interviewerId === user.id;
        }
        // Candidate: only their own interview
        if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            return interview.application.candidate.userId === user.id;
        }
        // Hiring Manager: within their managed jobs
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            return (interview.application.job.hiringManagerId === user.id ||
                (!!user.departmentId && interview.application.job.departmentId === user.departmentId));
        }
        return false;
    }
    static async canManage(user) {
        return (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER));
    }
}
exports.InterviewPolicy = InterviewPolicy;
