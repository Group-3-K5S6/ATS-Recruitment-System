"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobPolicy = void 0;
const roles_1 = require("../rbac/roles");
const prisma_1 = require("../database/prisma");
class JobPolicy {
    static async canView(user, jobId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER) ||
            user.roles.includes(roles_1.RoleType.APPROVER)) {
            return true;
        }
        const job = await prisma_1.prisma.job.findUnique({
            where: { id: jobId },
        });
        if (!job)
            return false;
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            return (job.hiringManagerId === user.id ||
                (!!user.departmentId && job.departmentId === user.departmentId));
        }
        if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            return job.status === 'PUBLISHED';
        }
        return false;
    }
    static async canCreate(user) {
        return (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER));
    }
    static async canUpdate(user, jobId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) || user.roles.includes(roles_1.RoleType.HR_MANAGER)) {
            return true;
        }
        if (user.roles.includes(roles_1.RoleType.RECRUITER)) {
            const job = await prisma_1.prisma.job.findUnique({ where: { id: jobId } });
            return !job?.recruiterId || job.recruiterId === user.id;
        }
        return false;
    }
}
exports.JobPolicy = JobPolicy;
