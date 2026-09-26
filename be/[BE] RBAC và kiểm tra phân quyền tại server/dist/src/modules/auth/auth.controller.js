"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = exports.refreshSchema = exports.registerSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../../database/prisma");
const password_1 = require("../../utils/password");
const token_1 = require("../../utils/token");
const response_1 = require("../../utils/response");
const audit_logger_1 = require("../../middleware/audit-logger");
const types_1 = require("../../rbac/types");
const roles_1 = require("../../rbac/roles");
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    fullName: zod_1.z.string().min(2),
    phone: zod_1.z.string().optional(),
});
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string(),
});
class AuthController {
    static async login(req, res) {
        const { email, password } = req.body;
        const user = await prisma_1.prisma.user.findUnique({
            where: { email },
            include: {
                roles: {
                    include: {
                        role: {
                            include: {
                                permissions: {
                                    include: { permission: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!user || !user.isActive) {
            (0, response_1.errorResponse)(res, 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');
            return;
        }
        const isMatch = await (0, password_1.comparePassword)(password, user.passwordHash);
        if (!isMatch) {
            (0, response_1.errorResponse)(res, 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');
            return;
        }
        const roles = [];
        const permissionSet = new Set();
        for (const ur of user.roles) {
            roles.push(ur.role.name);
            for (const rp of ur.role.permissions) {
                permissionSet.add(rp.permission.code);
            }
        }
        const payload = { userId: user.id, email: user.email };
        const accessToken = (0, token_1.signAccessToken)(payload);
        const refreshToken = (0, token_1.signRefreshToken)(payload);
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.LOGIN, 'user', user.id, {
            email: user.email,
        });
        (0, response_1.successResponse)(res, {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                departmentId: user.departmentId,
                roles,
                permissions: Array.from(permissionSet),
            },
        }, 200, 'Login successful');
    }
    static async register(req, res) {
        const { email, password, fullName, phone } = req.body;
        const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (existing) {
            (0, response_1.errorResponse)(res, 'Email is already registered.', 409, 'EMAIL_EXISTS');
            return;
        }
        const passwordHash = await (0, password_1.hashPassword)(password);
        const candidateRole = await prisma_1.prisma.role.findUnique({ where: { name: roles_1.RoleType.CANDIDATE } });
        if (!candidateRole) {
            (0, response_1.errorResponse)(res, 'Candidate role not configured.', 500, 'ROLE_MISSING');
            return;
        }
        const newUser = await prisma_1.prisma.user.create({
            data: {
                email,
                passwordHash,
                fullName,
                isActive: true,
                roles: {
                    create: {
                        roleId: candidateRole.id,
                    },
                },
                candidateProfile: {
                    create: {
                        fullName,
                        email,
                        phone: phone || null,
                    },
                },
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                createdAt: true,
            },
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.USER_CREATED, 'user', newUser.id, {
            role: roles_1.RoleType.CANDIDATE,
        });
        (0, response_1.successResponse)(res, newUser, 201, 'Registration successful. Candidate profile created.');
    }
    static async logout(req, res) {
        if (req.token) {
            await (0, token_1.revokeToken)(req.token);
        }
        if (req.user) {
            await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.LOGOUT, 'user', req.user.id);
        }
        (0, response_1.successResponse)(res, { message: 'Logged out successfully' }, 200);
    }
    static async refresh(req, res) {
        const { refreshToken } = req.body;
        const payload = (0, token_1.verifyRefreshToken)(refreshToken);
        if (!payload) {
            (0, response_1.errorResponse)(res, 'Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
            return;
        }
        const newAccessToken = (0, token_1.signAccessToken)({ userId: payload.userId, email: payload.email });
        (0, response_1.successResponse)(res, { accessToken: newAccessToken }, 200);
    }
    static async me(req, res) {
        if (!req.user) {
            (0, response_1.errorResponse)(res, 'Not authenticated', 401, 'UNAUTHORIZED');
            return;
        }
        (0, response_1.successResponse)(res, req.user, 200);
    }
}
exports.AuthController = AuthController;
