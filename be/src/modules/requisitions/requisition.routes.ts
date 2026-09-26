import { Router } from 'express';
import {
  RequisitionController,
  createRequisitionSchema,
  updateRequisitionSchema,
  approveRequisitionSchema,
} from './requisition.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionCode.REQUISITIONS_READ),
  RequisitionController.list
);

router.get(
  '/:id',
  requirePermission(PermissionCode.REQUISITIONS_READ),
  RequisitionController.getById
);

router.post(
  '/',
  requirePermission(PermissionCode.REQUISITIONS_CREATE),
  validateBody(createRequisitionSchema),
  RequisitionController.create
);

router.put(
  '/:id',
  requirePermission(PermissionCode.REQUISITIONS_UPDATE),
  validateBody(updateRequisitionSchema),
  RequisitionController.update
);

router.post(
  '/:id/approve',
  requirePermission(PermissionCode.REQUISITIONS_APPROVE),
  validateBody(approveRequisitionSchema),
  RequisitionController.approve
);

export default router;
