"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfferPolicy = void 0;
const roles_1 = require("../rbac/roles");
const prisma_1 = require("../database/prisma");
class OfferPolicy {
    static async canView(user, offerId) {
        // Interviewer cannot view offers
        if (user.roles.includes(roles_1.RoleType.INTERVIEWER)) {
            return false;
        }
        if (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER)) {
            return true;
        }
        const offer = await prisma_1.prisma.offer.findUnique({
            where: { id: offerId },
            include: {
                application: {
                    include: {
                        candidate: true,
                        job: true,
                    },
                },
            },
        });
        if (!offer)
            return false;
        // Candidate: can only view their own offer once SENT or APPROVED
        if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            return (offer.application.candidate.userId === user.id &&
                ['APPROVED', 'SENT', 'ACCEPTED', 'DECLINED'].includes(offer.status));
        }
        // Approver: can view offers assigned for approval
        if (user.roles.includes(roles_1.RoleType.APPROVER)) {
            return !offer.approverId || offer.approverId === user.id;
        }
        // Hiring Manager: within their department's jobs
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            const job = offer.application.job;
            return (job.hiringManagerId === user.id ||
                (!!user.departmentId && job.departmentId === user.departmentId));
        }
        return false;
    }
    static async canCreate(user) {
        return (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER));
    }
    static async canApprove(user, offerId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) || user.roles.includes(roles_1.RoleType.HR_MANAGER)) {
            return true;
        }
        if (user.roles.includes(roles_1.RoleType.APPROVER)) {
            const offer = await prisma_1.prisma.offer.findUnique({ where: { id: offerId } });
            return !offer?.approverId || offer.approverId === user.id;
        }
        return false;
    }
    static sanitize(user, offer) {
        if (!offer)
            return null;
        // For candidate: mask internal recruiter notes
        if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            const { internalNotes, ...safeOffer } = offer;
            return safeOffer;
        }
        return offer;
    }
}
exports.OfferPolicy = OfferPolicy;
