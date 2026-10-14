import { Router } from 'express';
import {
  RequisitionController,
  createRequisitionSchema,
  updateRequisitionSchema,
  approveRequisitionSchema,
  assignRecruitersSchema,
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

// SCRUM-99: Tạm dừng / Đóng / Đã tuyển đủ yêu cầu tuyển dụng
router.post(
  '/:id/close',
  requirePermission(PermissionCode.REQUISITIONS_UPDATE),
  RequisitionController.closeRequisition
);

// SCRUM-97 / SCRUM-41: BE-API phân công tuyển dụng & ghi lịch sử chuyển giao
router.post(
  '/:id/assign',
  requirePermission(PermissionCode.REQUISITIONS_UPDATE),
  validateBody(assignRecruitersSchema),
  RequisitionController.assignRecruiters
);

router.put(
  '/:id/assign',
  requirePermission(PermissionCode.REQUISITIONS_UPDATE),
  validateBody(assignRecruitersSchema),
  RequisitionController.assignRecruiters
);

router.post(
  '/:id/assign-recruiters',
  requirePermission(PermissionCode.REQUISITIONS_UPDATE),
  validateBody(assignRecruitersSchema),
  RequisitionController.assignRecruiters
);

router.get(
  '/:id/assignment-history',
  requirePermission(PermissionCode.REQUISITIONS_READ),
  RequisitionController.getAssignmentHistory
);

router.get(
  '/:id/handover-history',
  requirePermission(PermissionCode.REQUISITIONS_READ),
  RequisitionController.getAssignmentHistory
);

router.get(
  '/:id/applications',
  requirePermission(PermissionCode.CANDIDATES_READ),
  RequisitionController.getApplications
);

export default router;
