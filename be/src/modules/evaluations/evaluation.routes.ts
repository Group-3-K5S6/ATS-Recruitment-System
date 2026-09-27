import { Router } from 'express';
import {
  EvaluationController,
  createEvaluationSchema,
  updateEvaluationSchema,
} from './evaluation.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/:id',
  requirePermission(PermissionCode.EVALUATIONS_READ),
  EvaluationController.getById
);

router.post(
  '/',
  requirePermission(PermissionCode.EVALUATIONS_CREATE),
  validateBody(createEvaluationSchema),
  EvaluationController.create
);

router.put(
  '/:id',
  requirePermission(PermissionCode.EVALUATIONS_UPDATE),
  validateBody(updateEvaluationSchema),
  EvaluationController.update
);

export default router;
