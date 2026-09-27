import { Router } from 'express';
import {
  InterviewController,
  createInterviewSchema,
  updateInterviewSchema,
} from './interview.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionCode.INTERVIEWS_READ),
  InterviewController.list
);

router.get(
  '/:id',
  requirePermission(PermissionCode.INTERVIEWS_READ),
  InterviewController.getById
);

router.post(
  '/',
  requirePermission(PermissionCode.INTERVIEWS_CREATE),
  validateBody(createInterviewSchema),
  InterviewController.create
);

router.put(
  '/:id',
  requirePermission(PermissionCode.INTERVIEWS_UPDATE),
  validateBody(updateInterviewSchema),
  InterviewController.update
);

export default router;
