import { Router } from 'express';
import { CompetencyController } from './competency.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';
import {
  createFrameworkSchema,
  updateFrameworkSchema,
  createCriterionSchema,
  updateCriterionSchema,
  assignJobsSchema,
} from './competency.validation';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sprint 6 readiness: Get criteria assigned to a job
router.get(
  '/jobs/:jobId',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_READ),
  CompetencyController.getJobCriteria
);

// Framework CRUD
router.get(
  '/',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_READ),
  CompetencyController.list
);

router.get(
  '/:id',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_READ),
  CompetencyController.getById
);

router.post(
  '/',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_CREATE),
  validateBody(createFrameworkSchema),
  CompetencyController.create
);

router.put(
  '/:id',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  validateBody(updateFrameworkSchema),
  CompetencyController.update
);

router.delete(
  '/:id',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_DELETE),
  CompetencyController.delete
);

// Individual Criteria Management
router.post(
  '/:frameworkId/criteria',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  validateBody(createCriterionSchema),
  CompetencyController.addCriterion
);

router.put(
  '/:frameworkId/criteria/:criterionId',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  validateBody(updateCriterionSchema),
  CompetencyController.updateCriterion
);

router.delete(
  '/:frameworkId/criteria/:criterionId',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  CompetencyController.deleteCriterion
);

// Job Assignment Management
router.post(
  '/:id/jobs',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  validateBody(assignJobsSchema),
  CompetencyController.assignJobs
);

router.delete(
  '/:id/jobs/:jobId',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  CompetencyController.removeJob
);

export default router;
