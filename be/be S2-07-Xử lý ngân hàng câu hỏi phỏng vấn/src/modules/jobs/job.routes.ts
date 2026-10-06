import { Router } from 'express';
import { JobController, createJobSchema, updateJobSchema } from './job.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionCode.JOBS_READ),
  JobController.list
);

router.get(
  '/:id',
  requirePermission(PermissionCode.JOBS_READ),
  JobController.getById
);

router.post(
  '/',
  requirePermission(PermissionCode.JOBS_CREATE),
  validateBody(createJobSchema),
  JobController.create
);

router.put(
  '/:id',
  requirePermission(PermissionCode.JOBS_UPDATE),
  validateBody(updateJobSchema),
  JobController.update
);

router.post(
  '/:id/publish',
  requirePermission(PermissionCode.JOBS_PUBLISH),
  JobController.publish
);

export default router;
