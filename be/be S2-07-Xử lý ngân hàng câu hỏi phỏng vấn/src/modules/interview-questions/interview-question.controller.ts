import { Request, Response } from 'express';
import { InterviewQuestionService, AppError } from './interview-question.service';
import { InterviewQuestionPolicy } from '../../policies/interview-question.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { QuestionDifficulty } from './interview-question.types';

export class InterviewQuestionController {
  /**
   * List interview questions with filtering and searching
   */
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      if (!InterviewQuestionPolicy.canView(user)) {
        errorResponse(
          res,
          'Access denied. You do not have permission to view interview questions.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const { search, competencyFrameworkId, competencyCriterionId, difficulty } = req.query;

      const questions = await InterviewQuestionService.listQuestions({
        search: search ? String(search) : undefined,
        competencyFrameworkId: competencyFrameworkId ? String(competencyFrameworkId) : undefined,
        competencyCriterionId: competencyCriterionId ? String(competencyCriterionId) : undefined,
        difficulty: difficulty ? (difficulty as QuestionDifficulty) : undefined,
      });

      successResponse(res, questions, 200);
    } catch (error: any) {
      InterviewQuestionController.handleError(res, error);
    }
  }

  /**
   * Get question by ID
   */
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;

      if (!InterviewQuestionPolicy.canView(user)) {
        errorResponse(
          res,
          'Access denied. You do not have permission to view interview questions.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const question = await InterviewQuestionService.getQuestionById(id);
      if (!question) {
        errorResponse(res, 'Interview question not found.', 404, 'NOT_FOUND');
        return;
      }

      successResponse(res, question, 200);
    } catch (error: any) {
      InterviewQuestionController.handleError(res, error);
    }
  }

  /**
   * Create a new interview question
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      if (!InterviewQuestionPolicy.canCreate(user)) {
        errorResponse(
          res,
          'Access denied. You do not have permission to create interview questions.',
          403,
          'FORBIDDEN_PERMISSION'
        );
        return;
      }

      const question = await InterviewQuestionService.createQuestion(req.body, user);

      await recordRequestAudit(
        req,
        AuditAction.INTERVIEW_QUESTION_CREATED,
        'interview_question',
        question.id,
        {
          question: question.question,
          difficulty: question.difficulty,
          competencyCriterionId: question.competencyCriterionId,
        }
      );

      successResponse(res, question, 201, 'Interview question created successfully.');
    } catch (error: any) {
      InterviewQuestionController.handleError(res, error);
    }
  }

  /**
   * Update an interview question
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;

      const canUpdate = await InterviewQuestionPolicy.canUpdate(user, id);
      if (!canUpdate) {
        // IDOR / Security check: if user lacks permission, deny with 403
        if (
          !user.roles.includes('ADMIN' as any) &&
          !user.permissions.includes('interview_questions:update' as any)
        ) {
          errorResponse(
            res,
            'Access denied. You do not have permission to update interview questions.',
            403,
            'FORBIDDEN_PERMISSION'
          );
          return;
        }

        errorResponse(res, 'Interview question not found.', 404, 'NOT_FOUND');
        return;
      }

      const question = await InterviewQuestionService.updateQuestion(id, req.body, user);

      await recordRequestAudit(
        req,
        AuditAction.INTERVIEW_QUESTION_UPDATED,
        'interview_question',
        question.id,
        {
          question: question.question,
          difficulty: question.difficulty,
          competencyCriterionId: question.competencyCriterionId,
        }
      );

      successResponse(res, question, 200, 'Interview question updated successfully.');
    } catch (error: any) {
      InterviewQuestionController.handleError(res, error);
    }
  }

  /**
   * Delete an interview question
   */
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user!;
      const { id } = req.params;

      const canDelete = await InterviewQuestionPolicy.canDelete(user, id);
      if (!canDelete) {
        if (
          !user.roles.includes('ADMIN' as any) &&
          !user.permissions.includes('interview_questions:delete' as any)
        ) {
          errorResponse(
            res,
            'Access denied. You do not have permission to delete interview questions.',
            403,
            'FORBIDDEN_PERMISSION'
          );
          return;
        }

        errorResponse(res, 'Interview question not found.', 404, 'NOT_FOUND');
        return;
      }

      await InterviewQuestionService.deleteQuestion(id, user);

      await recordRequestAudit(
        req,
        AuditAction.INTERVIEW_QUESTION_DELETED,
        'interview_question',
        id,
        {}
      );

      successResponse(res, { id }, 200, 'Interview question deleted successfully.');
    } catch (error: any) {
      InterviewQuestionController.handleError(res, error);
    }
  }

  /**
   * Centralized error handler
   */
  private static handleError(res: Response, error: any): void {
    if (error instanceof AppError) {
      errorResponse(res, error.message, error.statusCode, error.code);
      return;
    }

    console.error('Unhandled interview question error:', error);
    errorResponse(res, 'An unexpected server error occurred.', 500, 'INTERNAL_SERVER_ERROR');
  }
}
