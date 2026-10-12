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

// SCRUM-91: Lấy trạng thái và lịch sử phê duyệt (bất biến, chỉ đọc)
router.get(
  '/:id/approval-history',
  requirePermission(PermissionCode.REQUISITIONS_READ),
  RequisitionController.getApprovalHistory
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

router.post(
  '/:id/reject',
  requirePermission(PermissionCode.REQUISITIONS_APPROVE),
  validateBody(approveRequisitionSchema),
  (req, res) => {
    req.body.decision = 'REJECT';
    return RequisitionController.approve(req, res);
  }
);

router.post(
  '/:id/request-changes',
  requirePermission(PermissionCode.REQUISITIONS_APPROVE),
  validateBody(approveRequisitionSchema),
  (req, res) => {
    req.body.decision = 'REQUEST_CHANGES';
    return RequisitionController.approve(req, res);
  }
);

router.get(
  '/:id/approval-history',
  requirePermission(PermissionCode.REQUISITIONS_READ),
  RequisitionController.getApprovalHistory
);

export default router;
