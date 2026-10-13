import { Router } from 'express';
import {
  ApplicationController,
  assignApplicationRecruiterSchema,
} from './application.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionCode.CANDIDATES_READ),
  ApplicationController.list
);

router.get(
  '/:id',
  requirePermission(PermissionCode.CANDIDATES_READ),
  ApplicationController.getById
);

router.post(
  '/:id/assign-recruiter',
  requirePermission(PermissionCode.CANDIDATES_UPDATE),
  validateBody(assignApplicationRecruiterSchema),
  ApplicationController.assignRecruiter
);

export default router;
