import { Router } from 'express';
import {
  CandidateController,
  createCandidateSchema,
  updateCandidateSchema,
  trackStatusSchema,
} from './candidate.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { createRateLimiter } from '../../middleware/rate-limiter';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

// In-memory rate limiter for status tracking (30 reqs/min per IP)
const trackStatusRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Quá nhiều yêu cầu tra cứu. Vui lòng thử lại sau ít phút.',
});

// Public endpoint: Tra cứu trạng thái hồ sơ ứng viên (No authentication required)
router.post(
  '/track-status',
  trackStatusRateLimiter,
  validateBody(trackStatusSchema),
  CandidateController.trackStatus
);

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
  '/:id/profile',
  requirePermission(PermissionCode.CANDIDATES_READ),
  CandidateController.getUnifiedProfile
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
