import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { RoleType } from '../../rbac/roles';
import {
  ReferralController,
  createReferralSchema,
} from './referral.controller';

const router = Router();

// Tất cả các endpoint đều yêu cầu đăng nhập
router.use(authenticate);

// Danh sách các vai trò nhân viên nội bộ
const EMPLOYEE_ROLES = [
  RoleType.ADMIN,
  RoleType.HR_MANAGER,
  RoleType.RECRUITER,
  RoleType.HIRING_MANAGER,
  RoleType.INTERVIEWER,
  RoleType.APPROVER,
];

// 1. Nhân viên nội bộ giới thiệu ứng viên
router.post(
  '/',
  requireRole(...EMPLOYEE_ROLES),
  validateBody(createReferralSchema),
  ReferralController.create
);

// 2. Người giới thiệu theo dõi kết quả các hồ sơ mình đã giới thiệu
router.get(
  '/my-referrals',
  requireRole(...EMPLOYEE_ROLES),
  ReferralController.getMyReferrals
);

// 3. Người giới thiệu xem chi tiết 1 hồ sơ đã giới thiệu
router.get(
  '/my-referrals/:id',
  requireRole(...EMPLOYEE_ROLES),
  ReferralController.getMyReferralDetail
);

// 4. Ban tuyển dụng (Admin, HR Manager, Recruiter) xem danh sách quản lý giới thiệu
router.get(
  '/',
  requireRole(RoleType.ADMIN, RoleType.HR_MANAGER, RoleType.RECRUITER),
  ReferralController.listAll
);

export default router;
