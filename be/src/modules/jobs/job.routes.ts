import { Router } from 'express';
import {
  JobController,
  createJobSchema,
  updateJobSchema,
  rejectJobSchema,
  approveJobSchema,
} from './job.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

// SCRUM-30 / SCRUM-107: Public job endpoints for candidates and guests



router.use(authenticate);

// Danh sách tin tuyển dụng
router.get(
  '/',
  requirePermission(PermissionCode.JOBS_READ),
  JobController.list
);

// SCRUM-105: Tiêu chí 2: Xem trước đúng như giao diện công khai trước khi xuất bản
router.get(
  '/:id/preview',
  requirePermission(PermissionCode.JOBS_READ),
  JobController.preview
);

// Chi tiết tin tuyển dụng
router.get(
  '/:id',
  requirePermission(PermissionCode.JOBS_READ),
  JobController.getById
);

// Tạo mới tin tuyển dụng
router.post(
  '/',
  requirePermission(PermissionCode.JOBS_CREATE),
  validateBody(createJobSchema),
  JobController.create
);

// Cập nhật tin tuyển dụng
router.put(
  '/:id',
  requirePermission(PermissionCode.JOBS_UPDATE),
  validateBody(updateJobSchema),
  JobController.update
);

// SCRUM-105: Nộp tin tuyển dụng để chờ phê duyệt
router.post(
  '/:id/submit-for-approval',
  requirePermission(PermissionCode.JOBS_UPDATE),
  JobController.submitForApproval
);

// SCRUM-105: Trưởng phòng Nhân sự duyệt tin tuyển dụng
router.post(
  '/:id/approve',
  requirePermission(PermissionCode.JOBS_APPROVE),
  validateBody(approveJobSchema),
  JobController.approve
);

// SCRUM-105: Trưởng phòng Nhân sự từ chối tin tuyển dụng
router.post(
  '/:id/reject',
  requirePermission(PermissionCode.JOBS_APPROVE),
  validateBody(rejectJobSchema),
  JobController.reject
);

// SCRUM-105: Tiêu chí 1 & 3: Xuất bản tin tuyển dụng (chỉ khi đã duyệt, ghi lại người xuất bản và thời điểm)
router.post(
  '/:id/publish',
  requirePermission(PermissionCode.JOBS_PUBLISH),
  JobController.publish
);

// SCRUM-105: Gỡ / Đóng tin tuyển dụng
router.post(
  '/:id/unpublish',
  requirePermission(PermissionCode.JOBS_PUBLISH),
  JobController.unpublish
);

router.post(
  '/:id/close',
  requirePermission(PermissionCode.JOBS_PUBLISH),
  JobController.unpublish
);

export default router;
