import type { Request } from 'express';
import { prisma } from '../database/prisma';

export async function logAudit(input: { actorId?: string | null; action: string; resourceType: string; resourceId?: string | null; ipAddress?: string | null; userAgent?: string | null; metadata?: unknown }) {
  try {
    await prisma.auditLog.create({ data: {
      actorId: input.actorId ?? null, action: input.action, resourceType: input.resourceType,
      resourceId: input.resourceId ?? null, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null,
      metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
    } });
  } catch (error) { console.error('Failed to record audit event:', error); }
}
export function recordRequestAudit(req: Request, action: string, resourceType: string, resourceId?: string, metadata?: unknown) {
  return logAudit({ actorId: req.user?.id, action, resourceType, resourceId, ipAddress: req.ip, userAgent: req.get('user-agent'), metadata });
}
