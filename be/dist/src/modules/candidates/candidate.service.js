"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CandidateService = void 0;
const prisma_1 = require("../../database/prisma");
const roles_1 = require("../../rbac/roles");
const candidate_policy_1 = require("../../policies/candidate.policy");
class CandidateService {
    /**
     * Scoped query: directly filter at database level according to user role & scope
     */
    static async findCandidateForUser(candidateId, currentUser) {
        // 1. Admin & HR Manager: Global access
        if (currentUser.roles.includes(roles_1.RoleType.ADMIN) ||
            currentUser.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            currentUser.roles.includes(roles_1.RoleType.RECRUITER)) {
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
            return candidate ? candidate_policy_1.CandidatePolicy.sanitize(currentUser, candidate) : null;
        }
        // 2. Candidate: Only their own profile
        if (currentUser.roles.includes(roles_1.RoleType.CANDIDATE)) {
            const candidate = await prisma_1.prisma.candidate.findFirst({
                where: {
                    id: candidateId,
                    userId: currentUser.id,
                },
                include: {
                    applications: {
                        include: {
                            job: true,
                            interviews: true,
                        },
                    },
                },
            });
            return candidate ? candidate_policy_1.CandidatePolicy.sanitize(currentUser, candidate) : null;
        }
        // 3. Hiring Manager: Candidate must have applied to a job in their department or managed by them
        if (currentUser.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            const candidate = await prisma_1.prisma.candidate.findFirst({
                where: {
                    id: candidateId,
                    applications: {
                        some: {
                            job: {
                                OR: [
                                    { hiringManagerId: currentUser.id },
                                    currentUser.departmentId ? { departmentId: currentUser.departmentId } : {},
                                ],
                            },
                        },
                    },
                },
                include: {
                    applications: {
                        include: {
                            job: true,
                            interviews: true,
                        },
                    },
                },
            });
            return candidate ? candidate_policy_1.CandidatePolicy.sanitize(currentUser, candidate) : null;
        }
        // 4. Interviewer: Candidate must be scheduled for an interview with this interviewer
        if (currentUser.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            const candidate = await prisma_1.prisma.candidate.findFirst({
                where: {
                    id: candidateId,
                    applications: {
                        some: {
                            interviews: {
                                some: {
                                    interviewerId: currentUser.id,
                                },
                            },
                        },
                    },
                },
                include: {
                    applications: {
                        include: {
                            job: true,
                            interviews: {
                                where: { interviewerId: currentUser.id },
                            },
                        },
                    },
                },
            });
            return candidate ? candidate_policy_1.CandidatePolicy.sanitize(currentUser, candidate) : null;
        }
        // 5. Approver: Candidates with pending offers or in approval workflow
        if (currentUser.roles.includes(roles_1.RoleType.APPROVER)) {
            const candidate = await prisma_1.prisma.candidate.findUnique({
                where: { id: candidateId },
                include: {
                    applications: {
                        include: {
                            job: true,
                        },
                    },
                },
            });
            return candidate ? candidate_policy_1.CandidatePolicy.sanitize(currentUser, candidate) : null;
        }
        return null;
    }
    /**
     * Scoped candidate listing: retrieves only candidates within user scope
     */
    static async listCandidatesForUser(currentUser) {
        if (currentUser.roles.includes(roles_1.RoleType.ADMIN) ||
            currentUser.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            currentUser.roles.includes(roles_1.RoleType.RECRUITER)) {
            const candidates = await prisma_1.prisma.candidate.findMany({
                include: {
                    applications: {
                        include: { job: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            return candidates.map((c) => candidate_policy_1.CandidatePolicy.sanitize(currentUser, c));
        }
        if (currentUser.roles.includes(roles_1.RoleType.CANDIDATE)) {
            const candidates = await prisma_1.prisma.candidate.findMany({
                where: { userId: currentUser.id },
                include: {
                    applications: {
                        include: { job: true },
                    },
                },
            });
            return candidates.map((c) => candidate_policy_1.CandidatePolicy.sanitize(currentUser, c));
        }
        if (currentUser.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            const candidates = await prisma_1.prisma.candidate.findMany({
                where: {
                    applications: {
                        some: {
                            job: {
                                OR: [
                                    { hiringManagerId: currentUser.id },
                                    currentUser.departmentId ? { departmentId: currentUser.departmentId } : {},
                                ],
                            },
                        },
                    },
                },
                include: {
                    applications: {
                        include: { job: true },
                    },
                },
            });
            return candidates.map((c) => candidate_policy_1.CandidatePolicy.sanitize(currentUser, c));
        }
        if (currentUser.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            const candidates = await prisma_1.prisma.candidate.findMany({
                where: {
                    applications: {
                        some: {
                            interviews: {
                                some: {
                                    interviewerId: currentUser.id,
                                },
                            },
                        },
                    },
                },
                include: {
                    applications: {
                        include: {
                            job: true,
                            interviews: {
                                where: { interviewerId: currentUser.id },
                            },
                        },
                    },
                },
            });
            return candidates.map((c) => candidate_policy_1.CandidatePolicy.sanitize(currentUser, c));
        }
        if (currentUser.roles.includes(roles_1.RoleType.APPROVER)) {
            const candidates = await prisma_1.prisma.candidate.findMany({
                include: {
                    applications: {
                        include: { job: true },
                    },
                },
            });
            return candidates.map((c) => candidate_policy_1.CandidatePolicy.sanitize(currentUser, c));
        }
        return [];
    }
}
exports.CandidateService = CandidateService;
