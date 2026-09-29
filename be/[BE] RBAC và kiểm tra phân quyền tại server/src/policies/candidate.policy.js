"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CandidatePolicy = void 0;
const roles_1 = require("../rbac/roles");
const prisma_1 = require("../database/prisma");
class CandidatePolicy {
    /**
     * Check if user has permission to view a specific candidate
     */
    static async canView(user, candidateId) {
        // 1. ADMIN and HR_MANAGER have global read access
        if (user.roles.includes(roles_1.RoleType.ADMIN) || user.roles.includes(roles_1.RoleType.HR_MANAGER)) {
            return true;
        }
        // 2. RECRUITER and APPROVER have general read access
        if (user.roles.includes(roles_1.RoleType.RECRUITER) || user.roles.includes(roles_1.RoleType.APPROVER)) {
            return true;
        }
        // Fetch candidate with necessary relationship context for scope check
        const candidate = await prisma_1.prisma.candidate.findUnique({
            where: { id: candidateId },
            include: {
                applications: {
                    include: {
                        job: true,
                        interviews: true,
                    },
                },
            },
        });
        if (!candidate)
            return false;
        // 3. CANDIDATE role: Can only view their own profile
        if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            return candidate.userId === user.id;
        }
        // 4. HIRING_MANAGER role: Can only view candidates who applied to their department's jobs
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            const hasJobInScope = candidate.applications.some((app) => app.job.hiringManagerId === user.id ||
                (user.departmentId && app.job.departmentId === user.departmentId));
            if (hasJobInScope)
                return true;
        }
        // 5. INTERVIEWER role: Can only view candidates they are assigned to interview
        if (user.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            const isAssignedInterviewer = candidate.applications.some((app) => app.interviews.some((interview) => interview.interviewerId === user.id));
            if (isAssignedInterviewer)
                return true;
        }
        return false;
    }
    /**
     * Check if user can update candidate
     */
    static async canUpdate(user, candidateId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) || user.roles.includes(roles_1.RoleType.HR_MANAGER)) {
            return true;
        }
        if (user.roles.includes(roles_1.RoleType.RECRUITER)) {
            return true;
        }
        if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            const candidate = await prisma_1.prisma.candidate.findUnique({
                where: { id: candidateId },
                select: { userId: true },
            });
            return candidate?.userId === user.id;
        }
        return false;
    }
    /**
     * Check if user can delete candidate
     */
    static async canDelete(user) {
        return (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER));
    }
    /**
     * Sanitize candidate data based on user role to shield sensitive personal data
     */
    static sanitize(user, candidate) {
        if (!candidate)
            return null;
        // Admin, HR Manager, Recruiter get full candidate data
        if (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER)) {
            return candidate;
        }
        // Own candidate sees full profile
        if (user.roles.includes(roles_1.RoleType.CANDIDATE) && candidate.userId === user.id) {
            return candidate;
        }
        // Interviewer gets masked data: NO expected salary, NO full personal address/phone
        if (user.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            const { expectedSalary, address, phone, ...safeData } = candidate;
            return {
                ...safeData,
                phone: phone ? `${phone.slice(0, 3)}****${phone.slice(-3)}` : null,
            };
        }
        // Hiring Manager & Approver get candidate details without private personal address
        const { address, ...safeData } = candidate;
        return safeData;
    }
}
exports.CandidatePolicy = CandidatePolicy;
