import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';
import {
  JobPostingDraftController,
  createJobPostingDraftSchema,
} from './job-posting-draft.controller';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requirePermission(PermissionCode.JOBS_CREATE),
  validateBody(createJobPostingDraftSchema),
  JobPostingDraftController.createDraft
);

export default router;
