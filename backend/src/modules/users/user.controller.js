"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = exports.assignRolesSchema = exports.updateUserSchema = exports.createUserSchema = void 0;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const prisma_1 = require("../../database/prisma");
const user_policy_1 = require("../../policies/user.policy");
const password_1 = require("../../utils/password");
const response_1 = require("../../utils/response");
const audit_logger_1 = require("../../middleware/audit-logger");
const types_1 = require("../../rbac/types");
const roles_1 = require("../../rbac/roles");
const internalRoleSchema = zod_1.z.nativeEnum(roles_1.RoleType).refine((role) => role !== roles_1.RoleType.CANDIDATE, 'Candidate is not an internal account role.');
const accountFields = {
    fullName: zod_1.z.string().trim().min(2).optional(),
    // `name` and `department` are accepted for compatibility with the current FE form.
    name: zod_1.z.string().trim().min(2).optional(),
    email: zod_1.z.string().trim().email().transform((email) => email.toLowerCase()).optional(),
    departmentId: zod_1.z.string().uuid().nullable().optional(),
    department: zod_1.z.string().trim().min(1).optional(),
};
exports.createUserSchema = zod_1.z.object({
    ...accountFields,
    email: zod_1.z.string().trim().email().transform((email) => email.toLowerCase()),
    fullName: zod_1.z.string().trim().min(2).optional(),
    password: zod_1.z.string().min(8).optional(),
    roles: zod_1.z.array(internalRoleSchema).min(1).optional(),
}).refine((data) => Boolean(data.fullName || data.name), {
    message: 'fullName or name is required.',
    path: ['fullName'],
});
exports.updateUserSchema = zod_1.z.object(accountFields).refine((data) => Object.values(data).some((value) => value !== undefined), { message: 'At least one account field must be provided.' });
exports.assignRolesSchema = zod_1.z.object({
    roles: zod_1.z.array(internalRoleSchema).min(1),
});
const listUsersQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().optional(),
    search: zod_1.z.string().trim().optional(),
    name: zod_1.z.string().trim().optional(),
    email: zod_1.z.string().trim().optional(),
    department: zod_1.z.string().trim().optional(),
    role: internalRoleSchema.optional(),
    status: zod_1.z.enum(['active', 'inactive', 'Hoạt động', 'Đã khóa']).optional(),
    isActive: zod_1.z.enum(['true', 'false']).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
const userSelect = {
    id: true,
    email: true,
    fullName: true,
    departmentId: true,
    isActive: true,
    createdAt: true,
    department: { select: { id: true, name: true, code: true } },
    roles: { include: { role: true } },
};
async function resolveDepartmentId(departmentId, departmentName) {
    if (departmentId !== undefined)
        return { id: departmentId };
    if (!departmentName)
        return { id: null };
    const departments = await prisma_1.prisma.department.findMany({ select: { id: true, name: true } });
    const department = departments.find((item) => item.name.trim().toLocaleLowerCase() === departmentName.toLocaleLowerCase());
    return department ? { id: department.id } : { error: `Department "${departmentName}" was not found.` };
}
function serializeUser(user) {
    return {
        ...user,
        department: user.department?.name ?? '',
        departmentName: user.department?.name ?? null,
        roles: user.roles.map((userRole) => userRole.role.name),
    };
}
class UserController {
    static async list(req, res) {
        const user = req.user;
        if (!user_policy_1.UserPolicy.canListUsers(user)) {
            (0, response_1.errorResponse)(res, 'Access denied. Only HR Managers and Admins can view users.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const parsed = listUsersQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            (0, response_1.errorResponse)(res, 'Invalid search or pagination parameters.', 400, 'VALIDATION_ERROR');
            return;
        }
        const { q, search, name, email, department, role, status, isActive, page, limit } = parsed.data;
        const keyword = q || search;
        const activeFilter = isActive !== undefined
            ? isActive === 'true'
            : status
                ? status === 'active' || status === 'Hoạt động'
                : undefined;
        const where = {
            roles: { some: { role: { name: { not: roles_1.RoleType.CANDIDATE } } } },
            ...(activeFilter !== undefined ? { isActive: activeFilter } : {}),
            ...(role ? { roles: { some: { role: { name: role } } } } : {}),
            ...(name ? { fullName: { contains: name } } : {}),
            ...(email ? { email: { contains: email.toLowerCase() } } : {}),
            ...(department ? { department: { name: { contains: department } } } : {}),
            ...(keyword ? {
                OR: [
                    { fullName: { contains: keyword } },
                    { email: { contains: keyword.toLowerCase() } },
                    { department: { name: { contains: keyword } } },
                ],
            } : {}),
        };
        const [total, users] = await prisma_1.prisma.$transaction([
            prisma_1.prisma.user.count({ where }),
            prisma_1.prisma.user.findMany({
                where,
                select: userSelect,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);
        res.status(200).json({
            success: true,
            data: users.map(serializeUser),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    static async create(req, res) {
        const data = req.body;
        if (!user_policy_1.UserPolicy.canManageUsers(req.user)) {
            (0, response_1.errorResponse)(res, 'Access denied. Only Admins can create internal user accounts.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const email = data.email.toLowerCase();
        const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (existing) {
            (0, response_1.errorResponse)(res, 'Email already in use.', 409, 'EMAIL_EXISTS');
            return;
        }
        const department = await resolveDepartmentId(data.departmentId, data.department);
        if ('error' in department) {
            (0, response_1.errorResponse)(res, department.error, 400, 'INVALID_DEPARTMENT');
            return;
        }
        const rolesToAssign = data.roles ?? [roles_1.RoleType.INTERVIEWER];
        const roles = await prisma_1.prisma.role.findMany({ where: { name: { in: rolesToAssign } } });
        if (roles.length !== rolesToAssign.length) {
            (0, response_1.errorResponse)(res, 'One or more requested roles are not configured.', 400, 'ROLE_MISSING');
            return;
        }
        // The current FE create form has no password input. Generate a one-time password
        // for that flow; callers that manage credentials can provide their own password.
        const temporaryPassword = data.password ? undefined : (0, crypto_1.randomBytes)(12).toString('base64url');
        const passwordHash = await (0, password_1.hashPassword)(data.password ?? temporaryPassword);
        const newUser = await prisma_1.prisma.user.create({
            data: {
                email,
                passwordHash,
                fullName: data.fullName ?? data.name,
                departmentId: department.id,
                isActive: true,
                roles: { create: roles.map((item) => ({ roleId: item.id })) },
            },
            select: { id: true, email: true, fullName: true, departmentId: true, isActive: true, createdAt: true },
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.USER_CREATED, 'user', newUser.id, { assignedRoles: rolesToAssign });
        (0, response_1.successResponse)(res, { ...newUser, ...(temporaryPassword ? { temporaryPassword } : {}) }, 201, 'User account created successfully.');
    }
    static async update(req, res) {
        if (!user_policy_1.UserPolicy.canManageUsers(req.user)) {
            (0, response_1.errorResponse)(res, 'Access denied. Only Admins can update internal user accounts.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const { id } = req.params;
        const target = await prisma_1.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
        if (!target || target.roles.every((item) => item.role.name === roles_1.RoleType.CANDIDATE)) {
            (0, response_1.errorResponse)(res, 'Internal user account not found.', 404, 'NOT_FOUND');
            return;
        }
        const data = req.body;
        const updateData = {};
        if (data.fullName !== undefined || data.name !== undefined)
            updateData.fullName = data.fullName ?? data.name;
        if (data.email !== undefined) {
            const email = data.email.toLowerCase();
            const duplicate = await prisma_1.prisma.user.findUnique({ where: { email } });
            if (duplicate && duplicate.id !== id) {
                (0, response_1.errorResponse)(res, 'Email already in use.', 409, 'EMAIL_EXISTS');
                return;
            }
            updateData.email = email;
        }
        if (data.departmentId !== undefined || data.department !== undefined) {
            const department = await resolveDepartmentId(data.departmentId, data.department);
            if ('error' in department) {
                (0, response_1.errorResponse)(res, department.error, 400, 'INVALID_DEPARTMENT');
                return;
            }
            updateData.departmentId = department.id;
        }
        const updated = await prisma_1.prisma.user.update({
            where: { id },
            data: updateData,
            select: { id: true, email: true, fullName: true, departmentId: true, isActive: true, updatedAt: true },
        });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.USER_UPDATED, 'user', id, { fields: Object.keys(updateData) });
        (0, response_1.successResponse)(res, updated, 200, 'User account updated successfully.');
    }
    static async assignRoles(req, res) {
        const { id } = req.params;
        const { roles } = req.body;
        if (!user_policy_1.UserPolicy.canAssignRoles(req.user)) {
            (0, response_1.errorResponse)(res, 'Access denied. Only Admins can modify user roles.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const targetUser = await prisma_1.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
        if (!targetUser || targetUser.roles.every((item) => item.role.name === roles_1.RoleType.CANDIDATE)) {
            (0, response_1.errorResponse)(res, 'Internal user account not found.', 404, 'NOT_FOUND');
            return;
        }
        const dbRoles = await prisma_1.prisma.role.findMany({ where: { name: { in: roles } } });
        if (dbRoles.length !== roles.length) {
            (0, response_1.errorResponse)(res, 'One or more requested roles are not configured.', 400, 'ROLE_MISSING');
            return;
        }
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.userRole.deleteMany({ where: { userId: id } }),
            prisma_1.prisma.userRole.createMany({ data: dbRoles.map((item) => ({ userId: id, roleId: item.id })) }),
        ]);
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.ROLE_CHANGED, 'user', id, { newRoles: roles });
        (0, response_1.successResponse)(res, { message: 'Roles updated successfully', roles }, 200);
    }
    static async disable(req, res) {
        const { id } = req.params;
        if (!user_policy_1.UserPolicy.canDisableUser(req.user, id)) {
            (0, response_1.errorResponse)(res, 'Access denied. Cannot disable user account or self.', 403, 'FORBIDDEN_ACTION');
            return;
        }
        const target = await prisma_1.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
        if (!target || target.roles.every((item) => item.role.name === roles_1.RoleType.CANDIDATE)) {
            (0, response_1.errorResponse)(res, 'Internal user account not found.', 404, 'NOT_FOUND');
            return;
        }
        const updated = await prisma_1.prisma.user.update({ where: { id }, data: { isActive: false }, select: { id: true, email: true, isActive: true } });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.USER_DISABLED, 'user', id);
        (0, response_1.successResponse)(res, updated, 200, 'User account has been disabled.');
    }
    static async enable(req, res) {
        const { id } = req.params;
        if (!user_policy_1.UserPolicy.canManageUsers(req.user)) {
            (0, response_1.errorResponse)(res, 'Access denied. Only Admins can enable accounts.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const target = await prisma_1.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
        if (!target || target.roles.every((item) => item.role.name === roles_1.RoleType.CANDIDATE)) {
            (0, response_1.errorResponse)(res, 'Internal user account not found.', 404, 'NOT_FOUND');
            return;
        }
        const updated = await prisma_1.prisma.user.update({ where: { id }, data: { isActive: true }, select: { id: true, email: true, isActive: true } });
        await (0, audit_logger_1.recordRequestAudit)(req, types_1.AuditAction.USER_UPDATED, 'user', id, { isActive: true });
        (0, response_1.successResponse)(res, updated, 200, 'User account has been enabled.');
    }
}
exports.UserController = UserController;
