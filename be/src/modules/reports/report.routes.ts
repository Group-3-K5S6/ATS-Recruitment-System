import { Router } from 'express';
import { ReportController } from './report.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/dashboard',
  requirePermission(PermissionCode.REPORTS_READ),
  ReportController.getDashboard
);

export default router;
