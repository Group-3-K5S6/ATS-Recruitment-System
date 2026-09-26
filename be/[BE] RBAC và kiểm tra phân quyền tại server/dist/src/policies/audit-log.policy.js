"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogPolicy = void 0;
const roles_1 = require("../rbac/roles");
class AuditLogPolicy {
    static canRead(user) {
        return user.roles.includes(roles_1.RoleType.ADMIN) || user.roles.includes(roles_1.RoleType.HR_MANAGER);
    }
    static canDelete(user) {
        // Only Admin has full privileges on audit logs, but audit logs are strictly immutable for general actors
        return user.roles.includes(roles_1.RoleType.ADMIN);
    }
}
exports.AuditLogPolicy = AuditLogPolicy;
