import { Request, Response } from 'express';
import { prisma } from '../../database/prisma';
import { AuditLogPolicy } from '../../policies/audit-log.policy';
import { successResponse, errorResponse } from '../../utils/response';

export class AuditLogController {
  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    if (!AuditLogPolicy.canRead(user)) {
      errorResponse(res, 'Access denied. Audit logs are restricted to Admins and HR Managers.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    const { action, resourceType, limit = '50', offset = '0' } = req.query;

    const whereClause: any = {};
    if (action) whereClause.action = String(action);
    if (resourceType) whereClause.resourceType = String(resourceType);

    const logs = await prisma.auditLog.findMany({
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

    successResponse(res, parsedLogs, 200);
  }
}
