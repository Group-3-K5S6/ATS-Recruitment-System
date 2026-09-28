import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireRole } from '../../middleware/authorize';
import { RoleType } from '../../rbac/roles';
import { prisma } from '../../database/prisma';
import { successResponse } from '../../utils/response';
const router = Router();
router.get('/', authenticate, requireRole(RoleType.ADMIN, RoleType.HR_MANAGER), requirePermission('audit_logs:read'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { actor: { select: { id: true, email: true, fullName: true } } } }),
      prisma.auditLog.count(),
    ]);
    return successResponse(res, { items, page, limit, total });
  } catch (error) { next(error); }
});
export default router;
