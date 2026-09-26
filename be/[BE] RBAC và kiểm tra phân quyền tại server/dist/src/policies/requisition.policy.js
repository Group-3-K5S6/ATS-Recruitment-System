"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequisitionPolicy = void 0;
const roles_1 = require("../rbac/roles");
const prisma_1 = require("../database/prisma");
class RequisitionPolicy {
    static async canView(user, requisitionId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER)) {
            return true;
        }
        const req = await prisma_1.prisma.requisition.findUnique({
            where: { id: requisitionId },
        });
        if (!req)
            return false;
        if (user.roles.includes(roles_1.RoleType.APPROVER)) {
            return req.approverId === user.id || true; // Approver can view requisitions to review
        }
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            return req.hiringManagerId === user.id || (!!user.departmentId && req.departmentId === user.departmentId);
        }
        return false;
    }
    static async canCreate(user, departmentId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER)) {
            return true;
        }
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            // Must be within their own department
            return !!user.departmentId && user.departmentId === departmentId;
        }
        return false;
    }
    static async canUpdate(user, requisitionId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER)) {
            return true;
        }
        const req = await prisma_1.prisma.requisition.findUnique({
            where: { id: requisitionId },
        });
        if (!req)
            return false;
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            return req.hiringManagerId === user.id || (!!user.departmentId && req.departmentId === user.departmentId);
        }
        return false;
    }
    static async canApprove(user, requisitionId) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) || user.roles.includes(roles_1.RoleType.HR_MANAGER)) {
            return true;
        }
        if (user.roles.includes(roles_1.RoleType.APPROVER)) {
            const req = await prisma_1.prisma.requisition.findUnique({
                where: { id: requisitionId },
            });
            if (!req)
                return false;
            return !req.approverId || req.approverId === user.id;
        }
        return false;
    }
}
exports.RequisitionPolicy = RequisitionPolicy;
