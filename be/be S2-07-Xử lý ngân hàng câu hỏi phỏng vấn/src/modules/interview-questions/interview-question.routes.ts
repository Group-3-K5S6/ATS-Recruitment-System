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

// All routes require authentication
router.use(authenticate);

// 1. List / search / filter interview questions
router.get(
  '/',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_READ),
  InterviewQuestionController.list
);

// 2. Get interview question details by ID
router.get(
  '/:id',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_READ),
  InterviewQuestionController.getById
);

// 3. Create a new interview question
router.post(
  '/',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_CREATE),
  validateBody(createInterviewQuestionSchema),
  InterviewQuestionController.create
);

// 4. Update an existing interview question
router.put(
  '/:id',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_UPDATE),
  validateBody(updateInterviewQuestionSchema),
  InterviewQuestionController.update
);

// 5. Delete an interview question
router.delete(
  '/:id',
  requirePermission(PermissionCode.INTERVIEW_QUESTIONS_DELETE),
  InterviewQuestionController.delete
);

export default router;
