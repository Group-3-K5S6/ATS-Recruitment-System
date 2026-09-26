"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const token_1 = require("../utils/token");
const prisma_1 = require("../database/prisma");
const response_1 = require("../utils/response");
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        (0, response_1.errorResponse)(res, 'Authentication required. Missing Bearer token.', 401, 'UNAUTHORIZED');
        return;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        (0, response_1.errorResponse)(res, 'Authentication required. Token is empty.', 401, 'UNAUTHORIZED');
        return;
    }
    // Check token revocation
    const revoked = await (0, token_1.isTokenRevoked)(token);
    if (revoked) {
        (0, response_1.errorResponse)(res, 'Token has been revoked. Please log in again.', 401, 'TOKEN_REVOKED');
        return;
    }
    // Verify JWT
    const payload = (0, token_1.verifyAccessToken)(token);
    if (!payload) {
        (0, response_1.errorResponse)(res, 'Invalid or expired token.', 401, 'INVALID_TOKEN');
        return;
    }
    // Load user from database with roles & permissions
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
            roles: {
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {
                                    permission: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!user || !user.isActive) {
        (0, response_1.errorResponse)(res, 'User account not found or deactivated.', 401, 'ACCOUNT_INACTIVE');
        return;
    }
    const roles = [];
    const permissionSet = new Set();
    for (const userRole of user.roles) {
        const roleName = userRole.role.name;
        roles.push(roleName);
        for (const rp of userRole.role.permissions) {
            permissionSet.add(rp.permission.code);
        }
    }
    req.user = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        departmentId: user.departmentId,
        roles,
        permissions: Array.from(permissionSet),
    };
    req.token = token;
    next();
}
