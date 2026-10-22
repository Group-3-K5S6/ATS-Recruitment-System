import { Router } from 'express';
import { AuditLogController } from './audit-log.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionCode.AUDIT_LOGS_READ),
  AuditLogController.list
);

export default router;
