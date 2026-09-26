"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserPolicy = void 0;
const roles_1 = require("../rbac/roles");
class UserPolicy {
    static canListUsers(user) {
        return user.roles.includes(roles_1.RoleType.ADMIN) || user.roles.includes(roles_1.RoleType.HR_MANAGER);
    }
    static canManageUsers(user) {
        return user.roles.includes(roles_1.RoleType.ADMIN);
    }
    static canAssignRoles(user) {
        return user.roles.includes(roles_1.RoleType.ADMIN);
    }
    static canDisableUser(user, targetUserId) {
        if (!user.roles.includes(roles_1.RoleType.ADMIN)) {
            return false;
        }
        // Prevent admin from disabling themselves
        return user.id !== targetUserId;
    }
}
exports.UserPolicy = UserPolicy;
