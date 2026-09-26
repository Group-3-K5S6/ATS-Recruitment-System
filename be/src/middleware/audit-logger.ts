import { Request } from 'express';
import { prisma } from '../database/prisma';
import { AuditAction, ResourceType } from '../rbac/types';

export interface AuditLogOptions {
  actorId?: string;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export async function logAudit(options: AuditLogOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
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
  } catch (error) {
    // Log error internally without breaking user flow, but don't leak to client
    console.error('Failed to write audit log:', error);
  }
}

export async function recordRequestAudit(
  req: Request,
  action: AuditAction,
  resourceType: ResourceType,
  resourceId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
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
