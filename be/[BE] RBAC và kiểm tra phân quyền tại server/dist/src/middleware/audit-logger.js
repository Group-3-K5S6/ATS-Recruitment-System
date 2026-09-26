"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
exports.recordRequestAudit = recordRequestAudit;
const prisma_1 = require("../database/prisma");
async function logAudit(options) {
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                actorId: options.actorId || null,
                action: options.action,
                resourceType: options.resourceType,
                resourceId: options.resourceId || null,
                ipAddress: options.ipAddress || null,
                userAgent: options.userAgent || null,
                metadata: options.metadata ? JSON.stringify(options.metadata) : null,
            },
        });
    }
    catch (error) {
        // Log error internally without breaking user flow, but don't leak to client
        console.error('Failed to write audit log:', error);
    }
}
async function recordRequestAudit(req, action, resourceType, resourceId, metadata) {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    await logAudit({
        actorId: req.user?.id,
        action,
        resourceType,
        resourceId,
        ipAddress,
        userAgent,
        metadata,
    });
}
