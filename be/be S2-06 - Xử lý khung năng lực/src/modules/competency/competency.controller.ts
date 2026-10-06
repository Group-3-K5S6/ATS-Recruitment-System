import { Request, Response } from 'express';
import { CompetencyService, AppError } from './competency.service';
import { CompetencyFrameworkPolicy } from '../../policies/competency-framework.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';

export class CompetencyController {
  /**
   * List competency frameworks
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
      const frameworks = await CompetencyService.listFrameworks({
        search: search as string,
        includeInactive: includeInactive === 'true',
        jobId: jobId as string,
      });

      successResponse(res, frameworks, 200);
    } catch (error: any) {
      CompetencyController.handleError(res, error);
    }
  }

  /**
   * Get framework by ID
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

      const framework = await CompetencyService.getFrameworkById(id);
      if (!framework) {
        errorResponse(res, 'Competency framework not found.', 404, 'NOT_FOUND');
        return;
      }

      successResponse(res, framework, 200);
    } catch (error: any) {
      CompetencyController.handleError(res, error);
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

      const framework = await CompetencyService.createFramework(req.body, user);

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
    } catch (error: any) {
      CompetencyController.handleError(res, error);
    }
  }

  /**
   * Update framework and criteria
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, id);
      if (!canUpdate) {
        errorResponse(
          res,
          'Access denied. You do not have permission to update this competency framework.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }

      const updated = await CompetencyService.updateFramework(id, req.body, user);

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
    } catch (error: any) {
      CompetencyController.handleError(res, error);
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

      const canDelete = await CompetencyFrameworkPolicy.canDelete(user, id);
      if (!canDelete) {
        errorResponse(
          res,
          'Access denied. You do not have permission to delete this competency framework.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }

      const result = await CompetencyService.deleteFramework(id, permanent, user);

      await recordRequestAudit(
        req,
        AuditAction.COMPETENCY_FRAMEWORK_DELETED,
        'competency_framework',
        id,
        { permanent, deactivated: result.deactivated }
      );

      successResponse(res, result, 200, result.message);
    } catch (error: any) {
      CompetencyController.handleError(res, error);
    }
  }

  /**
   * Add a single criterion to a framework
   */
  static async addCriterion(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { frameworkId } = req.params;

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, frameworkId);
      if (!canUpdate) {
        errorResponse(
          res,
          'Access denied. You do not have permission to modify criteria for this framework.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }

      const framework = await CompetencyService.addCriterion(frameworkId, req.body, user);

      await recordRequestAudit(
        req,
        AuditAction.COMPETENCY_CRITERION_CREATED,
        'competency_criterion',
        undefined,
        { frameworkId, criterionName: req.body.name, weight: req.body.weight }
      );

      successResponse(res, framework, 201, 'Criterion added successfully.');
    } catch (error: any) {
      CompetencyController.handleError(res, error);
    }
  }

  /**
   * Update a criterion
   */
  static async updateCriterion(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { frameworkId, criterionId } = req.params;

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, frameworkId);
      if (!canUpdate) {
        errorResponse(
          res,
          'Access denied. You do not have permission to modify criteria for this framework.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }

      const framework = await CompetencyService.updateCriterion(
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
    } catch (error: any) {
      CompetencyController.handleError(res, error);
    }
  }

  /**
   * Delete a criterion
   */
  static async deleteCriterion(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { frameworkId, criterionId } = req.params;

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, frameworkId);
      if (!canUpdate) {
        errorResponse(
          res,
          'Access denied. You do not have permission to delete criteria for this framework.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }

      const framework = await CompetencyService.deleteCriterion(frameworkId, criterionId, user);

      await recordRequestAudit(
        req,
        AuditAction.COMPETENCY_CRITERION_DELETED,
        'competency_criterion',
        criterionId,
        { frameworkId }
      );

      successResponse(res, framework, 200, 'Criterion deleted successfully.');
    } catch (error: any) {
      CompetencyController.handleError(res, error);
    }
  }

  /**
   * Assign jobs to a framework
   */
  static async assignJobs(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, id);
      if (!canUpdate) {
        errorResponse(
          res,
          'Access denied. You do not have permission to assign jobs to this framework.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }

      const framework = await CompetencyService.assignJobs(id, req.body.jobIds, user);
      successResponse(res, framework, 200, 'Jobs assigned to framework successfully.');
    } catch (error: any) {
      CompetencyController.handleError(res, error);
    }
  }

  /**
   * Remove a job from a framework
   */
  static async removeJob(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id, jobId } = req.params;

      const canUpdate = await CompetencyFrameworkPolicy.canUpdate(user, id);
      if (!canUpdate) {
        errorResponse(
          res,
          'Access denied. You do not have permission to remove jobs from this framework.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }

      const framework = await CompetencyService.removeJob(id, jobId, user);
      successResponse(res, framework, 200, 'Job removed from framework successfully.');
    } catch (error: any) {
      CompetencyController.handleError(res, error);
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

      const data = await CompetencyService.getCriteriaForJob(jobId);
      successResponse(res, data, 200);
    } catch (error: any) {
      CompetencyController.handleError(res, error);
    }
  }

  /**
   * Helper to format controller errors cleanly
   */
  private static handleError(res: Response, error: any): void {
    if (error instanceof AppError) {
      errorResponse(res, error.message, error.statusCode, error.code);
      return;
    }
    console.error('[Competency Error]:', error?.message || error);
    errorResponse(res, error?.message || 'An error occurred while processing your request.', 500, 'INTERNAL_ERROR');
  }
}
