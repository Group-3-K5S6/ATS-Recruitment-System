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

  constructor(
    message: string,
    statusCode = 400,
    code = 'BAD_REQUEST'
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class InterviewQuestionService {
  /**
   * Chuẩn hóa dữ liệu câu hỏi trả về
   */
  private static formatQuestion(
    question: any
  ): InterviewQuestionResponse {
    return {
      id: question.id,
      question: question.question,
      difficulty: question.difficulty,
      suggestedAnswer: question.suggestedAnswer,
      competencyCriterionId:
        question.competencyCriterionId,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,

      criterion: question.criterion
        ? {
            id: question.criterion.id,
            name: question.criterion.name,
            weight: question.criterion.weight,
            frameworkId:
              question.criterion.frameworkId,

            framework: question.criterion.framework
              ? {
                  id:
                    question.criterion.framework.id,
                  name:
                    question.criterion.framework.name,
                }
              : undefined,
          }
        : undefined,
    };
  }

  /**
   * Danh sách / tìm kiếm / lọc câu hỏi
   */
  static async listQuestions(
    query: InterviewQuestionFilterQuery
  ): Promise<InterviewQuestionResponse[]> {
    // Kiểm tra khung năng lực
    if (query.competencyFrameworkId) {
      const framework =
        await prisma.competencyFramework.findUnique({
          where: {
            id: query.competencyFrameworkId,
          },
        });

      if (!framework) {
        throw new AppError(
          'Competency framework not found.',
          404,
          'NOT_FOUND'
        );
      }
    }

    // Kiểm tra tiêu chí
    if (query.competencyCriterionId) {
      const criterion =
        await prisma.competencyCriterion.findUnique({
          where: {
            id: query.competencyCriterionId,
          },
        });

      if (!criterion) {
        throw new AppError(
          'Competency criterion not found.',
          404,
          'NOT_FOUND'
        );
      }
    }

    // S2-07: kiểm tra chức danh
    if (query.jobId) {
      const job = await prisma.job.findUnique({
        where: {
          id: query.jobId,
        },
      });

      if (!job) {
        throw new AppError(
          'Job not found.',
          404,
          'NOT_FOUND'
        );
      }
    }

    // Xây dựng điều kiện lọc
    const where: any = {};

    // Lọc mức độ khó
    if (query.difficulty) {
      where.difficulty = query.difficulty;
    }

    // Lọc theo tiêu chí
    if (query.competencyCriterionId) {
      where.competencyCriterionId =
        query.competencyCriterionId;
    }

    /**
     * Lọc theo:
     * - khung năng lực
     * - chức danh
     *
     * Không tạo where.criterion hai lần
     * để tránh ghi đè điều kiện.
     */
    if (
      query.competencyFrameworkId ||
      query.jobId
    ) {
      where.criterion = {};

      // Lọc theo khung năng lực
      if (query.competencyFrameworkId) {
        where.criterion.frameworkId =
          query.competencyFrameworkId;
      }

      // S2-07: lọc theo chức danh
      if (query.jobId) {
        where.criterion.framework = {
          jobMappings: {
            some: {
              jobId: query.jobId,
            },
          },
        };
      }
    }

    // Tìm kiếm nội dung câu hỏi hoặc gợi ý trả lời
    if (query.search) {
      where.OR = [
        {
          question: {
            contains: query.search,
          },
        },
        {
          suggestedAnswer: {
            contains: query.search,
          },
        },
      ];
    }

    const questions =
      await prisma.interviewQuestion.findMany({
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

        orderBy: {
          createdAt: 'desc',
        },
      });

    return questions.map(
      InterviewQuestionService.formatQuestion
    );
  }

  /**
   * Lấy chi tiết câu hỏi
   */
  static async getQuestionById(
    id: string
  ): Promise<InterviewQuestionResponse | null> {
    const question =
      await prisma.interviewQuestion.findUnique({
        where: {
          id,
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

    if (!question) {
      return null;
    }

    return this.formatQuestion(question);
  }

  /**
   * Tạo câu hỏi
   */
  static async createQuestion(
    data: CreateInterviewQuestionDTO,
    _user: AuthenticatedUser
  ): Promise<InterviewQuestionResponse> {
    // Kiểm tra tiêu chí tồn tại
    const criterion =
      await prisma.competencyCriterion.findUnique({
        where: {
          id: data.competencyCriterionId,
        },
      });

    if (!criterion) {
      throw new AppError(
        'Competency criterion not found. Cannot create question for non-existent criterion.',
        404,
        'NOT_FOUND'
      );
    }

    const created =
      await prisma.interviewQuestion.create({
        data: {
          question: data.question,
          difficulty: data.difficulty,
          suggestedAnswer:
            data.suggestedAnswer,
          competencyCriterionId:
            data.competencyCriterionId,
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
   * Cập nhật câu hỏi
   */
  static async updateQuestion(
    id: string,
    data: UpdateInterviewQuestionDTO,
    _user: AuthenticatedUser
  ): Promise<InterviewQuestionResponse> {
    const existing =
      await prisma.interviewQuestion.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      throw new AppError(
        'Interview question not found.',
        404,
        'NOT_FOUND'
      );
    }

    // Nếu đổi tiêu chí thì kiểm tra tiêu chí mới
    if (data.competencyCriterionId) {
      const criterion =
        await prisma.competencyCriterion.findUnique({
          where: {
            id: data.competencyCriterionId,
          },
        });

      if (!criterion) {
        throw new AppError(
          'Competency criterion not found. Cannot associate question with non-existent criterion.',
          404,
          'NOT_FOUND'
        );
      }
    }

    const updated =
      await prisma.interviewQuestion.update({
        where: {
          id,
        },

        data: {
          ...(data.question
            ? {
                question: data.question,
              }
            : {}),

          ...(data.difficulty
            ? {
                difficulty: data.difficulty,
              }
            : {}),

          ...(data.suggestedAnswer
            ? {
                suggestedAnswer:
                  data.suggestedAnswer,
              }
            : {}),

          ...(data.competencyCriterionId
            ? {
                competencyCriterionId:
                  data.competencyCriterionId,
              }
            : {}),
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
   * Xóa câu hỏi
   */
  static async deleteQuestion(
    id: string,
    _user: AuthenticatedUser
  ): Promise<void> {
    const existing =
      await prisma.interviewQuestion.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      throw new AppError(
        'Interview question not found.',
        404,
        'NOT_FOUND'
      );
    }

    await prisma.interviewQuestion.delete({
      where: {
        id,
      },
    });
  }
}