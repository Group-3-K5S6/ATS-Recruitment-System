import { Router } from 'express';
import { InterviewQuestionController } from './interview-question.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';
import {
  createInterviewQuestionSchema,
  updateInterviewQuestionSchema,
} from './interview-question.validation';

const router = Router();

// Tất cả route đều yêu cầu đăng nhập
router.use(authenticate);

// 1. Danh sách / tìm kiếm / lọc câu hỏi
router.get(
  '/',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_READ),
  InterviewQuestionController.list
);

// 2. Lookup chức danh / khung năng lực / tiêu chí
// PHẢI đặt trước /:id
router.get(
  '/lookups',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_READ),
  InterviewQuestionController.getLookups
);

// 3. Chi tiết câu hỏi theo ID
router.get(
  '/:id',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_READ),
  InterviewQuestionController.getById
);

// 4. Tạo câu hỏi
router.post(
  '/',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_CREATE),
  validateBody(createInterviewQuestionSchema),
  InterviewQuestionController.create
);

// 5. Cập nhật câu hỏi
router.put(
  '/:id',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_UPDATE),
  validateBody(updateInterviewQuestionSchema),
  InterviewQuestionController.update
);

// 6. Xóa câu hỏi
router.delete(
  '/:id',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_DELETE),
  InterviewQuestionController.delete
);

export default router;