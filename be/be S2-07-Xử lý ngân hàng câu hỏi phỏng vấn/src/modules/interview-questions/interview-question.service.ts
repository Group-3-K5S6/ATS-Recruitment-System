import { prisma } from '../../database/prisma';
import { AuthenticatedUser } from '../../rbac/types';
import {
  CreateInterviewQuestionDTO,
  UpdateInterviewQuestionDTO,
  InterviewQuestionFilterQuery,
  InterviewQuestionResponse,
} from './interview-question.types';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class InterviewQuestionService {
  /**
   * Format Prisma model into InterviewQuestionResponse
   */
  private static formatQuestion(question: any): InterviewQuestionResponse {
    return {
      id: question.id,
      question: question.question,
      difficulty: question.difficulty,
      suggestedAnswer: question.suggestedAnswer,
      competencyCriterionId: question.competencyCriterionId,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      criterion: question.criterion
        ? {
            id: question.criterion.id,
            name: question.criterion.name,
            weight: question.criterion.weight,
            frameworkId: question.criterion.frameworkId,
            framework: question.criterion.framework
              ? {
                  id: question.criterion.framework.id,
                  name: question.criterion.framework.name,
                }
              : undefined,
          }
        : undefined,
    };
  }

  /**
   * List interview questions with filtering and searching
   */
  static async listQuestions(
    query: InterviewQuestionFilterQuery
  ): Promise<InterviewQuestionResponse[]> {
    // 1. Validate competencyFrameworkId if provided
    if (query.competencyFrameworkId) {
      const framework = await prisma.competencyFramework.findUnique({
        where: { id: query.competencyFrameworkId },
      });
      if (!framework) {
        throw new AppError('Competency framework not found.', 404, 'NOT_FOUND');
      }
    }

    // 2. Validate competencyCriterionId if provided
    if (query.competencyCriterionId) {
      const criterion = await prisma.competencyCriterion.findUnique({
        where: { id: query.competencyCriterionId },
      });
      if (!criterion) {
        throw new AppError('Competency criterion not found.', 404, 'NOT_FOUND');
      }
    }

    // 3. Build Prisma where clause
    const where: any = {};

    if (query.difficulty) {
      where.difficulty = query.difficulty;
    }

    if (query.competencyCriterionId) {
      where.competencyCriterionId = query.competencyCriterionId;
    }

    if (query.competencyFrameworkId) {
      where.criterion = {
        frameworkId: query.competencyFrameworkId,
      };
    }

    if (query.search) {
      where.OR = [
        { question: { contains: query.search } },
        { suggestedAnswer: { contains: query.search } },
      ];
    }

    const questions = await prisma.interviewQuestion.findMany({
      where,
      include: {
        criterion: {
          select: {
            id: true,
            name: true,
            weight: true,
            frameworkId: true,
            framework: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return questions.map(this.formatQuestion);
  }

  /**
   * Get an interview question by ID
   */
  static async getQuestionById(id: string): Promise<InterviewQuestionResponse | null> {
    const question = await prisma.interviewQuestion.findUnique({
      where: { id },
      include: {
        criterion: {
          select: {
            id: true,
            name: true,
            weight: true,
            frameworkId: true,
            framework: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!question) {
      return null;
    }

    return this.formatQuestion(question);
  }

  /**
   * Create a new interview question
   */
  static async createQuestion(
    data: CreateInterviewQuestionDTO,
    _user: AuthenticatedUser
  ): Promise<InterviewQuestionResponse> {
    // 1. Verify existence of the referenced criterion (prevent orphans)
    const criterion = await prisma.competencyCriterion.findUnique({
      where: { id: data.competencyCriterionId },
    });

    if (!criterion) {
      throw new AppError(
        'Competency criterion not found. Cannot create question for non-existent criterion.',
        404,
        'NOT_FOUND'
      );
    }

    // 2. Create the interview question in database
    const created = await prisma.interviewQuestion.create({
      data: {
        question: data.question,
        difficulty: data.difficulty,
        suggestedAnswer: data.suggestedAnswer,
        competencyCriterionId: data.competencyCriterionId,
      },
      include: {
        criterion: {
          select: {
            id: true,
            name: true,
            weight: true,
            frameworkId: true,
            framework: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return this.formatQuestion(created);
  }

  /**
   * Update an existing interview question
   */
  static async updateQuestion(
    id: string,
    data: UpdateInterviewQuestionDTO,
    _user: AuthenticatedUser
  ): Promise<InterviewQuestionResponse> {
    // 1. Check if question exists
    const existing = await prisma.interviewQuestion.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Interview question not found.', 404, 'NOT_FOUND');
    }

    // 2. If competencyCriterionId is being updated, verify new criterion exists
    if (data.competencyCriterionId) {
      const criterion = await prisma.competencyCriterion.findUnique({
        where: { id: data.competencyCriterionId },
      });

      if (!criterion) {
        throw new AppError(
          'Competency criterion not found. Cannot associate question with non-existent criterion.',
          404,
          'NOT_FOUND'
        );
      }
    }

    // 3. Update the record
    const updated = await prisma.interviewQuestion.update({
      where: { id },
      data: {
        ...(data.question ? { question: data.question } : {}),
        ...(data.difficulty ? { difficulty: data.difficulty } : {}),
        ...(data.suggestedAnswer ? { suggestedAnswer: data.suggestedAnswer } : {}),
        ...(data.competencyCriterionId ? { competencyCriterionId: data.competencyCriterionId } : {}),
      },
      include: {
        criterion: {
          select: {
            id: true,
            name: true,
            weight: true,
            frameworkId: true,
            framework: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return this.formatQuestion(updated);
  }

  /**
   * Delete an interview question
   */
  static async deleteQuestion(id: string, _user: AuthenticatedUser): Promise<void> {
    const existing = await prisma.interviewQuestion.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Interview question not found.', 404, 'NOT_FOUND');
    }

    await prisma.interviewQuestion.delete({
      where: { id },
    });
  }
}
