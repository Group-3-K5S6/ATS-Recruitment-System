"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportPolicy = void 0;
const roles_1 = require("../rbac/roles");
class ReportPolicy {
    static canView(user) {
        return (user.roles.includes(roles_1.RoleType.ADMIN) ||
            user.roles.includes(roles_1.RoleType.HR_MANAGER) ||
            user.roles.includes(roles_1.RoleType.HIRING_MANAGER) ||
            user.roles.includes(roles_1.RoleType.RECRUITER) ||
            user.roles.includes(roles_1.RoleType.APPROVER));
    }
    static getReportScopeFilter(user) {
        if (user.roles.includes(roles_1.RoleType.ADMIN) || user.roles.includes(roles_1.RoleType.HR_MANAGER)) {
            return {}; // Global scope
        }
        if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            return { departmentId: user.departmentId || undefined };
        }
        if (user.roles.includes(roles_1.RoleType.RECRUITER)) {
            return { recruiterId: user.id };
        }
        return {};
    }
}
exports.ReportPolicy = ReportPolicy;
