import { Router } from 'express';
import { CandidateController, createCandidateSchema, updateCandidateSchema } from './candidate.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionCode.CANDIDATES_READ),
  CandidateController.list
);

router.get(
  '/:id',
  requirePermission(PermissionCode.CANDIDATES_READ),
  CandidateController.getById
);

router.get(
  '/:id/cv',
  requirePermission(PermissionCode.CANDIDATES_READ),
  CandidateController.getCv
);

router.post(
  '/',
  requirePermission(PermissionCode.CANDIDATES_CREATE),
  validateBody(createCandidateSchema),
  CandidateController.create
);

router.put(
  '/:id',
  requirePermission(PermissionCode.CANDIDATES_UPDATE),
  validateBody(updateCandidateSchema),
  CandidateController.update
);

router.delete(
  '/:id',
  requirePermission(PermissionCode.CANDIDATES_DELETE),
  CandidateController.delete
);

export default router;
