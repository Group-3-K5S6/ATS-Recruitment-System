"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = exports.assignRolesSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../../database/prisma");
const user_policy_1 = require("../../policies/user.policy");
const password_1 = require("../../utils/password");
const response_1 = require("../../utils/response");
const audit_logger_1 = require("../../middleware/audit-logger");
const types_1 = require("../../rbac/types");
const roles_1 = require("../../rbac/roles");
exports.createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    fullName: zod_1.z.string().min(2),
    departmentId: zod_1.z.string().uuid().optional(),
    roles: zod_1.z.array(zod_1.z.nativeEnum(roles_1.RoleType)).min(1),
});
exports.assignRolesSchema = zod_1.z.object({
    roles: zod_1.z.array(zod_1.z.nativeEnum(roles_1.RoleType)).min(1),
});
class UserController {
    static async list(req, res) {
        const user = req.user;
        if (!user_policy_1.UserPolicy.canListUsers(user)) {
            (0, response_1.errorResponse)(res, 'Access denied. Only HR Managers and Admins can view users.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const users = await prisma_1.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                fullName: true,
                departmentId: true,
                isActive: true,
                createdAt: true,
                department: true,
                roles: {
                    include: {
                        role: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        const sanitizedUsers = users.map((u) => ({
            ...u,
            roles: u.roles.map((r) => r.role.name),
        }));
        (0, response_1.successResponse)(res, sanitizedUsers, 200);
    }
    static async create(req, res) {
        const data = req.body;
        const user = req.user;
        if (!user_policy_1.UserPolicy.canManageUsers(user)) {
            (0, response_1.errorResponse)(res, 'Access denied. Only Admins can create internal user accounts.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const existing = await prisma_1.prisma.user.findUnique({ where: { email: data.email } });
        if (existing) {
            (0, response_1.errorResponse)(res, 'Email already in use.', 409, 'EMAIL_EXISTS');
            return;
        }
        const passwordHash = await (0, password_1.hashPassword)(data.password);
        // Fetch role IDs
        const roles = await prisma_1.prisma.role.findMany({
            where: { name: { in: data.roles } },
        });
        const newUser = await prisma_1.prisma.user.create({
            data: {
                email: data.email,
                passwordHash,
                fullName: data.fullName,
                departmentId: data.departmentId,
                isActive: true,
                roles: {
                    create: roles.map((r) => ({ roleId: r.id })),
                },
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                departmentId: true,
                isActive: true,
                createdAt: true,
            },
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.USER_CREATED, 'user', newUser.id, {
            assignedRoles: data.roles,
        });
        (0, response_1.successResponse)(res, newUser, 201, 'User account created successfully.');
    }
    static async assignRoles(req, res) {
        const { id } = req.params;
        const { roles } = req.body;
        const user = req.user;
        if (!user_policy_1.UserPolicy.canAssignRoles(user)) {
            (0, response_1.errorResponse)(res, 'Access denied. Only Admins can modify user roles.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const targetUser = await prisma_1.prisma.user.findUnique({ where: { id } });
        if (!targetUser) {
            (0, response_1.errorResponse)(res, 'User not found.', 404, 'NOT_FOUND');
            return;
        }
        const dbRoles = await prisma_1.prisma.role.findMany({
            where: { name: { in: roles } },
        });
        // Replace roles atomically
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.userRole.deleteMany({ where: { userId: id } }),
            prisma_1.prisma.userRole.createMany({
                data: dbRoles.map((r) => ({ userId: id, roleId: r.id })),
            }),
        ]);
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.ROLE_CHANGED, 'user', id, {
            newRoles: roles,
        });
        (0, response_1.successResponse)(res, { message: 'Roles updated successfully', roles }, 200);
    }
    static async disable(req, res) {
        const { id } = req.params;
        const user = req.user;
        if (!user_policy_1.UserPolicy.canDisableUser(user, id)) {
            (0, response_1.errorResponse)(res, 'Access denied. Cannot disable user account or self.', 403, 'FORBIDDEN_ACTION');
            return;
        }
        const updated = await prisma_1.prisma.user.update({
            where: { id },
            data: { isActive: false },
            select: { id: true, email: true, isActive: true },
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.USER_DISABLED, 'user', id);
        (0, response_1.successResponse)(res, updated, 200, 'User account has been disabled.');
    }
}
exports.UserController = UserController;
