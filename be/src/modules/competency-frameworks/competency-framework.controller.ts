import { Request, Response } from 'express';
import { CompetencyFrameworkService, AppError } from './competency-framework.service';
import { CompetencyFrameworkPolicy } from '../../policies/competency-framework.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { PermissionCode } from '../../rbac/permissions';

export class CompetencyFrameworkController {
  /**
   * List competency frameworks with optional filters
   */
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      if (!CompetencyFrameworkPolicy.canView(user)) {
        errorResponse(
          res,
          'Access denied. You do not have permission to view competency frameworks.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const { search, includeInactive, jobId } = req.query;
      const frameworks = await CompetencyFrameworkService.listFrameworks({
        search: search ? String(search) : undefined,
        includeInactive: includeInactive === 'true',
        jobId: jobId ? String(jobId) : undefined,
      });

      successResponse(res, frameworks, 200);
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Get framework details by ID
   */
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;

      if (!CompetencyFrameworkPolicy.canView(user)) {
        errorResponse(
          res,
          'Access denied. You do not have permission to view competency frameworks.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const framework = await CompetencyFrameworkService.getFrameworkById(id);
      if (!framework) {
        errorResponse(res, 'Competency framework not found.', 404, 'NOT_FOUND');
        return;
      }

      successResponse(res, framework, 200);
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Create a new competency framework
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      if (!CompetencyFrameworkPolicy.canCreate(user)) {
        errorResponse(
          res,
          'Access denied. You do not have permission to create competency frameworks.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const framework = await CompetencyFrameworkService.createFramework(req.body, user);

      await recordRequestAudit(
        req,
        AuditAction.COMPETENCY_FRAMEWORK_CREATED,
        'competency_framework',
        framework.id,
        {
          name: framework.name,
          criteriaCount: framework.criteria.length,
          totalWeight: framework.totalWeight,
        }
      );

      successResponse(res, framework, 201, 'Competency framework created successfully.');
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Update framework details and criteria
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;

      const hasPermission =
        user.roles.includes(RoleType.ADMIN) ||
        user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE);

      if (!hasPermission) {
        errorResponse(
          res,
          'Access denied. You do not have permission to update competency frameworks.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, id);
      if (!canUpdate) {
        errorResponse(res, 'Competency framework not found.', 404, 'NOT_FOUND');
        return;
      }

      const updated = await CompetencyFrameworkService.updateFramework(id, req.body, user);

      await recordRequestAudit(
        req,
        AuditAction.COMPETENCY_FRAMEWORK_UPDATED,
        'competency_framework',
        updated.id,
        {
          name: updated.name,
          criteriaCount: updated.criteria.length,
        }
      );

      successResponse(res, updated, 200, 'Competency framework updated successfully.');
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Delete or deactivate framework
   */
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;
      const permanent = req.query.permanent === 'true';

      const hasPermission =
        user.roles.includes(RoleType.ADMIN) ||
        user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_DELETE);

      if (!hasPermission) {
        errorResponse(
          res,
          'Access denied. You do not have permission to delete competency frameworks.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const canDelete = await CompetencyFrameworkPolicy.canDelete(user, id);
      if (!canDelete) {
        errorResponse(res, 'Competency framework not found.', 404, 'NOT_FOUND');
        return;
      }

      const result = await CompetencyFrameworkService.deleteFramework(id, permanent, user);

      await recordRequestAudit(
        req,
        AuditAction.COMPETENCY_FRAMEWORK_DELETED,
        'competency_framework',
        id,
        { permanent, deactivated: result.deactivated }
      );

      successResponse(res, result, 200, result.message);
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Add a single criterion to a framework
   */
  static async addCriterion(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { frameworkId } = req.params;

      const hasPermission =
        user.roles.includes(RoleType.ADMIN) ||
        user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE);

      if (!hasPermission) {
        errorResponse(
          res,
          'Access denied. You do not have permission to modify criteria for this framework.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, frameworkId);
      if (!canUpdate) {
        errorResponse(res, 'Competency framework not found.', 404, 'NOT_FOUND');
        return;
      }

      const framework = await CompetencyFrameworkService.addCriterion(frameworkId, req.body, user);

      await recordRequestAudit(
        req,
        AuditAction.COMPETENCY_CRITERION_CREATED,
        'competency_criterion',
        undefined,
        { frameworkId, criterionName: req.body.name, weight: req.body.weight }
      );

      successResponse(res, framework, 201, 'Criterion added successfully.');
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Update a criterion
   */
  static async updateCriterion(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { frameworkId, criterionId } = req.params;

      const hasPermission =
        user.roles.includes(RoleType.ADMIN) ||
        user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE);

      if (!hasPermission) {
        errorResponse(
          res,
          'Access denied. You do not have permission to modify criteria for this framework.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, frameworkId);
      if (!canUpdate) {
        errorResponse(res, 'Competency framework not found.', 404, 'NOT_FOUND');
        return;
      }

      const framework = await CompetencyFrameworkService.updateCriterion(
        frameworkId,
        criterionId,
        req.body,
        user
      );

      await recordRequestAudit(
        req,
        AuditAction.COMPETENCY_CRITERION_UPDATED,
        'competency_criterion',
        criterionId,
        { frameworkId }
      );

      successResponse(res, framework, 200, 'Criterion updated successfully.');
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Delete a criterion
   */
  static async deleteCriterion(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { frameworkId, criterionId } = req.params;

      const hasPermission =
        user.roles.includes(RoleType.ADMIN) ||
        user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE);

      if (!hasPermission) {
        errorResponse(
          res,
          'Access denied. You do not have permission to delete criteria for this framework.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, frameworkId);
      if (!canUpdate) {
        errorResponse(res, 'Competency framework not found.', 404, 'NOT_FOUND');
        return;
      }

      const framework = await CompetencyFrameworkService.deleteCriterion(frameworkId, criterionId, user);

      await recordRequestAudit(
        req,
        AuditAction.COMPETENCY_CRITERION_DELETED,
        'competency_criterion',
        criterionId,
        { frameworkId }
      );

      successResponse(res, framework, 200, 'Criterion deleted successfully.');
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Assign jobs to a framework
   */
  static async assignJobs(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;

      const hasPermission =
        user.roles.includes(RoleType.ADMIN) ||
        user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE);

      if (!hasPermission) {
        errorResponse(
          res,
          'Access denied. You do not have permission to assign jobs to this framework.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, id);
      if (!canUpdate) {
        errorResponse(res, 'Competency framework not found.', 404, 'NOT_FOUND');
        return;
      }

      const framework = await CompetencyFrameworkService.assignJobs(id, req.body.jobIds, user);
      successResponse(res, framework, 200, 'Jobs assigned to framework successfully.');
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Remove a job from a framework
   */
  static async removeJob(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id, jobId } = req.params;

      const hasPermission =
        user.roles.includes(RoleType.ADMIN) ||
        user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE);

      if (!hasPermission) {
        errorResponse(
          res,
          'Access denied. You do not have permission to remove jobs from this framework.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, id);
      if (!canUpdate) {
        errorResponse(res, 'Competency framework not found.', 404, 'NOT_FOUND');
        return;
      }

      const framework = await CompetencyFrameworkService.removeJob(id, jobId, user);
      successResponse(res, framework, 200, 'Job removed from framework successfully.');
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Sprint 6 Integration: Get criteria list for a specific job
   */
  static async getJobCriteria(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { jobId } = req.params;

      if (!CompetencyFrameworkPolicy.canView(user)) {
        errorResponse(
          res,
          'Access denied. You do not have permission to view competency framework criteria.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const data = await CompetencyFrameworkService.getCriteriaForJob(jobId);
      successResponse(res, data, 200);
    } catch (error: unknown) {
      CompetencyFrameworkController.handleError(res, error);
    }
  }

  /**
   * Error handling helper
   */
  private static handleError(res: Response, error: unknown): void {
    if (error instanceof AppError) {
      errorResponse(res, error.message, error.statusCode, error.code);
      return;
    }
    const message = error instanceof Error ? error.message : 'An error occurred while processing your request.';
    console.error('[Competency Controller Error]:', message);
    errorResponse(res, message, 500, 'INTERNAL_ERROR');
  }
}
