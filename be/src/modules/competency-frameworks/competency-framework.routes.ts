import { Router } from 'express';
import { CompetencyFrameworkController } from './competency-framework.controller';
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
} from './competency-framework.validation';

const router = Router();

// All routes require authentication
router.use(authenticate);

// 1. Specific route: Get criteria assigned to a job (placed BEFORE /:id)
router.get(
  '/jobs/:jobId',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_READ),
  CompetencyFrameworkController.getJobCriteria
);

// 2. Framework CRUD
router.get(
  '/',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_READ),
  CompetencyFrameworkController.list
);

router.get(
  '/:id',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_READ),
  CompetencyFrameworkController.getById
);

router.post(
  '/',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_CREATE),
  validateBody(createFrameworkSchema),
  CompetencyFrameworkController.create
);

router.put(
  '/:id',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  validateBody(updateFrameworkSchema),
  CompetencyFrameworkController.update
);

router.delete(
  '/:id',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_DELETE),
  CompetencyFrameworkController.delete
);

// 3. Individual Criteria Management
router.post(
  '/:frameworkId/criteria',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  validateBody(createCriterionSchema),
  CompetencyFrameworkController.addCriterion
);

router.put(
  '/:frameworkId/criteria/:criterionId',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  validateBody(updateCriterionSchema),
  CompetencyFrameworkController.updateCriterion
);

router.delete(
  '/:frameworkId/criteria/:criterionId',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  CompetencyFrameworkController.deleteCriterion
);

// 4. Job Assignment Management
router.post(
  '/:id/jobs',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  validateBody(assignJobsSchema),
  CompetencyFrameworkController.assignJobs
);

router.delete(
  '/:id/jobs/:jobId',
  requirePermission(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE),
  CompetencyFrameworkController.removeJob
);

export default router;
