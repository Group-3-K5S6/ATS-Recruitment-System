"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogController = void 0;
const prisma_1 = require("../../database/prisma");
const audit_log_policy_1 = require("../../policies/audit-log.policy");
const response_1 = require("../../utils/response");
class AuditLogController {
    static async list(req, res) {
        const user = req.user;
        if (!audit_log_policy_1.AuditLogPolicy.canRead(user)) {
            (0, response_1.errorResponse)(res, 'Access denied. Audit logs are restricted to Admins and HR Managers.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const { action, resourceType, limit = '50', offset = '0' } = req.query;
        const whereClause = {};
        if (action)
            whereClause.action = String(action);
        if (resourceType)
            whereClause.resourceType = String(resourceType);
        const logs = await prisma_1.prisma.auditLog.findMany({
            where: whereClause,
            include: {
                actor: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: Math.min(parseInt(String(limit), 10) || 50, 100),
            skip: parseInt(String(offset), 10) || 0,
        });
        const parsedLogs = logs.map((log) => ({
            ...log,
            metadata: log.metadata ? JSON.parse(log.metadata) : null,
        }));
        (0, response_1.successResponse)(res, parsedLogs, 200);
    }
}
exports.AuditLogController = AuditLogController;
