"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
exports.requireRole = requireRole;
const roles_1 = require("../rbac/roles");
const response_1 = require("../utils/response");
/**
 * Authorization Guard checking if authenticated user has required permission
 */
function requirePermission(...requiredPermissions) {
    return (req, res, next) => {
        if (!req.user) {
            (0, response_1.errorResponse)(res, 'Authentication required before authorization.', 401, 'UNAUTHORIZED');
            return;
        }
        // Admin has full system access
        if (req.user.roles.includes(roles_1.RoleType.ADMIN)) {
            next();
            return;
        }
        const hasPermission = requiredPermissions.some((perm) => req.user.permissions.includes(perm));
        if (!hasPermission) {
            (0, response_1.errorResponse)(res, 'Access denied. You do not have the required permission for this resource.', 403, 'FORBIDDEN_PERMISSION');
            return;
        }
        next();
    };
}
/**
 * Authorization Guard checking if user has specific role
 */
function requireRole(...requiredRoles) {
    return (req, res, next) => {
        if (!req.user) {
            (0, response_1.errorResponse)(res, 'Authentication required before authorization.', 401, 'UNAUTHORIZED');
            return;
        }
        const hasRole = requiredRoles.some((role) => req.user.roles.includes(role));
        if (!hasRole) {
            (0, response_1.errorResponse)(res, 'Access denied. You do not have the required role for this action.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        next();
    };
}
