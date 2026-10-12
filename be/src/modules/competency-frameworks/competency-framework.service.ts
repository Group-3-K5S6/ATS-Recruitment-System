import { prisma } from '../../database/prisma';
import { AuthenticatedUser } from '../../rbac/types';
import {
  CreateCompetencyFrameworkDTO,
  UpdateCompetencyFrameworkDTO,
  CreateCriterionDTO,
  UpdateCriterionDTO,
  CompetencyFrameworkResponse,
  CriterionResponse,
  JobCriteriaResponse,
} from './competency-framework.types';
import { Prisma } from '@prisma/client';

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

type FrameworkWithRelations =
  Prisma.CompetencyFrameworkGetPayload<{
    include: {
      criteria: true;
      jobTitleMappings: {
        include: {
          jobTitle: true;
        };
      };
    };
  }>;

export class CompetencyFrameworkService {
  private static formatFramework(
    framework: FrameworkWithRelations
  ): CompetencyFrameworkResponse {
    const criteria: CriterionResponse[] = framework.criteria.map((criterion) => ({
      id: criterion.id,
      frameworkId: criterion.frameworkId,
      name: criterion.name,
      description: criterion.description,
      weight: criterion.weight,
      createdAt: criterion.createdAt,
      updatedAt: criterion.updatedAt,
    }));

    const totalWeight = Number(
      criteria
        .reduce((sum, criterion) => sum + criterion.weight, 0)
        .toFixed(2)
    );

    const jobTitles = framework.jobTitleMappings.map((mapping) => ({
      id: mapping.jobTitle.id,
      code: mapping.jobTitle.code,
      name: mapping.jobTitle.name,
      level: mapping.jobTitle.level,
    }));

    return {
      id: framework.id,
      name: framework.name,
      description: framework.description,
      isActive: framework.isActive,
      totalWeight,
      createdAt: framework.createdAt,
      updatedAt: framework.updatedAt,
      criteria,
      jobTitles,
    };
  }

  static async listFrameworks(query: {
    search?: string;
    includeInactive?: boolean;
    jobTitleId?: string;
  }): Promise<CompetencyFrameworkResponse[]> {
    const where: Prisma.CompetencyFrameworkWhereInput = {};

    if (!query.includeInactive) {
      where.isActive = true;
    }

    if (query.search) {
      where.OR = [
        {
          name: {
            contains: query.search,
          },
        },
        {
          description: {
            contains: query.search,
          },
        },
      ];
    }

    if (query.jobTitleId) {
      where.jobTitleMappings = {
        some: {
          jobTitleId: query.jobTitleId,
        },
      };
    }

    const frameworks = await prisma.competencyFramework.findMany({
      where,
      include: {
        criteria: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        jobTitleMappings: {
          include: {
            jobTitle: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return frameworks.map((framework) =>
      CompetencyFrameworkService.formatFramework(framework)
    );
  }

  static async getFrameworkById(
    id: string
  ): Promise<CompetencyFrameworkResponse | null> {
    const framework = await prisma.competencyFramework.findUnique({
      where: {
        id,
      },
      include: {
        criteria: {
          orderBy: {
            createdAt: 'asc',
          },
        },
        jobTitleMappings: {
          include: {
            jobTitle: true,
          },
        },
      },
    });

    if (!framework) {
      return null;
    }

    return CompetencyFrameworkService.formatFramework(framework);
  }

  static async createFramework(
    data: CreateCompetencyFrameworkDTO,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    if (!data.criteria || data.criteria.length === 0) {
      throw new AppError(
        'Framework must contain at least one criterion.',
        400,
        'VALIDATION_ERROR'
      );
    }

    for (const criterion of data.criteria) {
      if (criterion.weight <= 0 || criterion.weight > 100) {
        throw new AppError(
          `Criterion weight must be between 0 and 100. Invalid weight: ${criterion.weight} for "${criterion.name}".`,
          400,
          'VALIDATION_ERROR'
        );
      }
    }

    const seenNames = new Set<string>();

    for (const criterion of data.criteria) {
      const normalizedName = criterion.name.trim().toLowerCase();

      if (seenNames.has(normalizedName)) {
        throw new AppError(
          `Duplicate criterion name "${criterion.name}" within framework.`,
          400,
          'DUPLICATE_CRITERION'
        );
      }

      seenNames.add(normalizedName);
    }

    const totalWeight = data.criteria.reduce(
      (sum, criterion) => sum + criterion.weight,
      0
    );

    if (Math.abs(Number(totalWeight.toFixed(4)) - 100) > 0.001) {
      throw new AppError(
        `Total criteria weight must equal 100%. Current sum: ${Number(
          totalWeight.toFixed(2)
        )}%.`,
        400,
        'INVALID_WEIGHT_SUM'
      );
    }

    if (data.jobTitleIds && data.jobTitleIds.length > 0) {
      const existingJobTitles = await prisma.jobTitle.findMany({
        where: {
          id: {
            in: data.jobTitleIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingJobTitles.length !== data.jobTitleIds.length) {
        throw new AppError(
          'One or more assigned job titles do not exist.',
          400,
          'JOB_TITLE_NOT_FOUND'
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      return tx.competencyFramework.create({
        data: {
          name: data.name.trim(),
          description: data.description?.trim() || null,
          isActive: data.isActive !== undefined ? data.isActive : true,

          criteria: {
            create: data.criteria.map((criterion) => ({
              name: criterion.name.trim(),
              description: criterion.description?.trim() || null,
              weight: criterion.weight,
            })),
          },

          jobTitleMappings:
            data.jobTitleIds && data.jobTitleIds.length > 0
              ? {
                  create: data.jobTitleIds.map((jobTitleId) => ({
                    jobTitleId,
                  })),
                }
              : undefined,
        },

        include: {
          criteria: {
            orderBy: {
              createdAt: 'asc',
            },
          },
          jobTitleMappings: {
            include: {
              jobTitle: true,
            },
          },
        },
      });
    });

    return CompetencyFrameworkService.formatFramework(created);
  }

  static async updateFramework(
    id: string,
    data: UpdateCompetencyFrameworkDTO,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const existing = await prisma.competencyFramework.findUnique({
      where: {
        id,
      },
      include: {
        criteria: true,
        jobTitleMappings: true,
      },
    });

    if (!existing) {
      throw new AppError(
        'Competency framework not found.',
        404,
        'NOT_FOUND'
      );
    }

    if (data.criteria !== undefined) {
      if (data.criteria.length === 0) {
        throw new AppError(
          'Framework must contain at least one criterion.',
          400,
          'VALIDATION_ERROR'
        );
      }

      for (const criterion of data.criteria) {
        if (criterion.weight <= 0 || criterion.weight > 100) {
          throw new AppError(
            `Criterion weight must be between 0 and 100. Invalid weight: ${criterion.weight} for "${criterion.name}".`,
            400,
            'VALIDATION_ERROR'
          );
        }
      }

      const seenNames = new Set<string>();

      for (const criterion of data.criteria) {
        const normalizedName = criterion.name.trim().toLowerCase();

        if (seenNames.has(normalizedName)) {
          throw new AppError(
            `Duplicate criterion name "${criterion.name}" within framework.`,
            400,
            'DUPLICATE_CRITERION'
          );
        }

        seenNames.add(normalizedName);
      }

      const totalWeight = data.criteria.reduce(
        (sum, criterion) => sum + criterion.weight,
        0
      );

      if (Math.abs(Number(totalWeight.toFixed(4)) - 100) > 0.001) {
        throw new AppError(
          `Total criteria weight must equal 100%. Current sum: ${Number(
            totalWeight.toFixed(2)
          )}%.`,
          400,
          'INVALID_WEIGHT_SUM'
        );
      }
    }

    if (data.jobTitleIds && data.jobTitleIds.length > 0) {
      const existingJobTitles = await prisma.jobTitle.findMany({
        where: {
          id: {
            in: data.jobTitleIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingJobTitles.length !== data.jobTitleIds.length) {
        throw new AppError(
          'One or more assigned job titles do not exist.',
          400,
          'JOB_TITLE_NOT_FOUND'
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.competencyFramework.update({
        where: {
          id,
        },
        data: {
          name: data.name ? data.name.trim() : undefined,

          description:
            data.description !== undefined
              ? data.description?.trim() || null
              : undefined,

          isActive:
            data.isActive !== undefined
              ? data.isActive
              : undefined,
        },
      });

      if (data.criteria !== undefined) {
        const incomingIds = data.criteria
          .filter((criterion) => Boolean(criterion.id))
          .map((criterion) => criterion.id as string);

        const criteriaToDelete = existing.criteria.filter(
          (criterion) => !incomingIds.includes(criterion.id)
        );

        for (const criterion of criteriaToDelete) {
          const questionCount = await tx.interviewQuestion.count({
            where: {
              competencyCriterionId: criterion.id,
            },
          });

          if (questionCount > 0) {
            throw new AppError(
              `Cannot remove criterion "${criterion.name}" because interview questions are referencing it.`,
              400,
              'CRITERION_IN_USE'
            );
          }

          await tx.competencyCriterion.delete({
            where: {
              id: criterion.id,
            },
          });
        }

        for (const criterion of data.criteria) {
          if (criterion.id) {
            const belongsToFramework = existing.criteria.some(
              (existingCriterion) =>
                existingCriterion.id === criterion.id
            );

            if (!belongsToFramework) {
              throw new AppError(
                'Criterion does not belong to this framework.',
                400,
                'INVALID_CRITERION_SCOPE'
              );
            }

            await tx.competencyCriterion.update({
              where: {
                id: criterion.id,
              },
              data: {
                name: criterion.name.trim(),
                description:
                  criterion.description?.trim() || null,
                weight: criterion.weight,
              },
            });
          } else {
            await tx.competencyCriterion.create({
              data: {
                frameworkId: id,
                name: criterion.name.trim(),
                description:
                  criterion.description?.trim() || null,
                weight: criterion.weight,
              },
            });
          }
        }
      }

      if (data.jobTitleIds !== undefined) {
        await tx.jobTitleCompetencyFramework.deleteMany({
          where: {
            frameworkId: id,
          },
        });

        if (data.jobTitleIds.length > 0) {
          await tx.jobTitleCompetencyFramework.createMany({
            data: data.jobTitleIds.map((jobTitleId) => ({
              jobTitleId,
              frameworkId: id,
            })),
          });
        }
      }

      return tx.competencyFramework.findUniqueOrThrow({
        where: {
          id,
        },
        include: {
          criteria: {
            orderBy: {
              createdAt: 'asc',
            },
          },
          jobTitleMappings: {
            include: {
              jobTitle: true,
            },
          },
        },
      });
    });

    return CompetencyFrameworkService.formatFramework(updated);
  }

  static async deleteFramework(
    id: string,
    permanent = false,
    _user: AuthenticatedUser
  ): Promise<{
    message: string;
    deactivated?: boolean;
    deleted?: boolean;
  }> {
    const framework = await prisma.competencyFramework.findUnique({
      where: {
        id,
      },
      include: {
        jobTitleMappings: true,
        criteria: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!framework) {
      throw new AppError(
        'Competency framework not found.',
        404,
        'NOT_FOUND'
      );
    }

    const hasJobTitles = framework.jobTitleMappings.length > 0;

    const criterionIds = framework.criteria.map(
      (criterion) => criterion.id
    );

    const questionsCount =
      criterionIds.length > 0
        ? await prisma.interviewQuestion.count({
            where: {
              competencyCriterionId: {
                in: criterionIds,
              },
            },
          })
        : 0;

    const isInUse = hasJobTitles || questionsCount > 0;

    if (permanent) {
      if (isInUse) {
        throw new AppError(
          'Cannot permanently delete competency framework that is in use by job titles or interview questions.',
          400,
          'FRAMEWORK_IN_USE'
        );
      }

      await prisma.competencyFramework.delete({
        where: {
          id,
        },
      });

      return {
        message:
          'Competency framework permanently deleted successfully.',
        deleted: true,
      };
    }

    await prisma.competencyFramework.update({
      where: {
        id,
      },
      data: {
        isActive: false,
      },
    });

    return {
      message:
        'Competency framework deactivated successfully.',
      deactivated: true,
    };
  }

  static async addCriterion(
    frameworkId: string,
    data: CreateCriterionDTO,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: {
        id: frameworkId,
      },
      include: {
        criteria: true,
      },
    });

    if (!framework) {
      throw new AppError(
        'Competency framework not found.',
        404,
        'NOT_FOUND'
      );
    }

    if (data.weight <= 0 || data.weight > 100) {
      throw new AppError(
        'Criterion weight must be between 0 and 100.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const normalizedName = data.name.trim().toLowerCase();

    if (
      framework.criteria.some(
        (criterion) =>
          criterion.name.trim().toLowerCase() ===
          normalizedName
      )
    ) {
      throw new AppError(
        `Duplicate criterion name "${data.name}" within framework.`,
        400,
        'DUPLICATE_CRITERION'
      );
    }

    const currentWeight = framework.criteria.reduce(
      (sum, criterion) => sum + criterion.weight,
      0
    );

    const newTotal = currentWeight + data.weight;

    if (Math.abs(Number(newTotal.toFixed(4)) - 100) > 0.001) {
      throw new AppError(
        `Total criteria weight of framework must equal 100%. Current total would be ${Number(
          newTotal.toFixed(2)
        )}%.`,
        400,
        'INVALID_WEIGHT_SUM'
      );
    }

    await prisma.competencyCriterion.create({
      data: {
        frameworkId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        weight: data.weight,
      },
    });

    const refreshed =
      await CompetencyFrameworkService.getFrameworkById(
        frameworkId
      );

    return refreshed!;
  }

  static async updateCriterion(
    frameworkId: string,
    criterionId: string,
    data: UpdateCriterionDTO,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: {
        id: frameworkId,
      },
      include: {
        criteria: true,
      },
    });

    if (!framework) {
      throw new AppError(
        'Competency framework not found.',
        404,
        'NOT_FOUND'
      );
    }

    const criterion = framework.criteria.find(
      (item) => item.id === criterionId
    );

    if (!criterion) {
      throw new AppError(
        'Criterion not found in this framework.',
        404,
        'CRITERION_NOT_FOUND'
      );
    }

    if (
      data.weight !== undefined &&
      (data.weight <= 0 || data.weight > 100)
    ) {
      throw new AppError(
        'Criterion weight must be between 0 and 100.',
        400,
        'VALIDATION_ERROR'
      );
    }

    if (data.name) {
      const normalizedName = data.name.trim().toLowerCase();

      const duplicated = framework.criteria.some(
        (item) =>
          item.id !== criterionId &&
          item.name.trim().toLowerCase() === normalizedName
      );

      if (duplicated) {
        throw new AppError(
          `Duplicate criterion name "${data.name}" within framework.`,
          400,
          'DUPLICATE_CRITERION'
        );
      }
    }

    if (data.weight !== undefined) {
      const otherWeight = framework.criteria
        .filter((item) => item.id !== criterionId)
        .reduce((sum, item) => sum + item.weight, 0);

      const newTotal = otherWeight + data.weight;

      if (
        Math.abs(Number(newTotal.toFixed(4)) - 100) >
        0.001
      ) {
        throw new AppError(
          `Total criteria weight of framework must equal 100%. Current total would be ${Number(
            newTotal.toFixed(2)
          )}%.`,
          400,
          'INVALID_WEIGHT_SUM'
        );
      }
    }

    await prisma.competencyCriterion.update({
      where: {
        id: criterionId,
      },
      data: {
        name: data.name ? data.name.trim() : undefined,

        description:
          data.description !== undefined
            ? data.description?.trim() || null
            : undefined,

        weight: data.weight,
      },
    });

    const refreshed =
      await CompetencyFrameworkService.getFrameworkById(
        frameworkId
      );

    return refreshed!;
  }

  static async deleteCriterion(
    frameworkId: string,
    criterionId: string,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: {
        id: frameworkId,
      },
      include: {
        criteria: true,
      },
    });

    if (!framework) {
      throw new AppError(
        'Competency framework not found.',
        404,
        'NOT_FOUND'
      );
    }

    const criterion = framework.criteria.find(
      (item) => item.id === criterionId
    );

    if (!criterion) {
      throw new AppError(
        'Criterion not found in this framework.',
        404,
        'CRITERION_NOT_FOUND'
      );
    }

    const questionCount = await prisma.interviewQuestion.count({
      where: {
        competencyCriterionId: criterionId,
      },
    });

    if (questionCount > 0) {
      throw new AppError(
        'Cannot delete criterion because interview questions are referencing it.',
        400,
        'CRITERION_IN_USE'
      );
    }

    if (framework.criteria.length <= 1) {
      throw new AppError(
        'Cannot delete the only criterion of the framework.',
        400,
        'CANNOT_DELETE_LAST_CRITERION'
      );
    }

    const remainingWeight = framework.criteria
      .filter((item) => item.id !== criterionId)
      .reduce((sum, item) => sum + item.weight, 0);

    if (
      Math.abs(Number(remainingWeight.toFixed(4)) - 100) >
      0.001
    ) {
      throw new AppError(
        `Cannot delete criterion because remaining total weight would be ${Number(
          remainingWeight.toFixed(2)
        )}% instead of 100%.`,
        400,
        'INVALID_WEIGHT_SUM'
      );
    }

    await prisma.competencyCriterion.delete({
      where: {
        id: criterionId,
      },
    });

    const refreshed =
      await CompetencyFrameworkService.getFrameworkById(
        frameworkId
      );

    return refreshed!;
  }

  static async assignJobTitles(
    frameworkId: string,
    jobTitleIds: string[],
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: {
        id: frameworkId,
      },
    });

    if (!framework) {
      throw new AppError(
        'Competency framework not found.',
        404,
        'NOT_FOUND'
      );
    }

    const uniqueJobTitleIds = [...new Set(jobTitleIds)];

    const existingJobTitles = await prisma.jobTitle.findMany({
      where: {
        id: {
          in: uniqueJobTitleIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (
      existingJobTitles.length !== uniqueJobTitleIds.length
    ) {
      throw new AppError(
        'One or more specified job titles do not exist.',
        400,
        'JOB_TITLE_NOT_FOUND'
      );
    }

    for (const jobTitleId of uniqueJobTitleIds) {
      await prisma.jobTitleCompetencyFramework.upsert({
        where: {
          jobTitleId_frameworkId: {
            jobTitleId,
            frameworkId,
          },
        },
        update: {},
        create: {
          jobTitleId,
          frameworkId,
        },
      });
    }

    const refreshed =
      await CompetencyFrameworkService.getFrameworkById(
        frameworkId
      );

    return refreshed!;
  }

  static async removeJobTitle(
    frameworkId: string,
    jobTitleId: string,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: {
        id: frameworkId,
      },
    });

    if (!framework) {
      throw new AppError(
        'Competency framework not found.',
        404,
        'NOT_FOUND'
      );
    }

    await prisma.jobTitleCompetencyFramework.deleteMany({
      where: {
        frameworkId,
        jobTitleId,
      },
    });

    const refreshed =
      await CompetencyFrameworkService.getFrameworkById(
        frameworkId
      );

    return refreshed!;
  }

  static async getCriteriaForJob(
    jobId: string
  ): Promise<JobCriteriaResponse> {
    const job = await prisma.job.findUnique({
      where: {
        id: jobId,
      },
      include: {
        jobTitle: {
          include: {
            competencyFrameworks: {
              include: {
                framework: {
                  include: {
                    criteria: {
                      orderBy: {
                        createdAt: 'asc',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!job) {
      throw new AppError(
        'Job not found.',
        404,
        'NOT_FOUND'
      );
    }

    const frameworks =
      job.jobTitle?.competencyFrameworks
        .map((mapping) => mapping.framework)
        .filter((framework) => framework.isActive) ?? [];

    const criteria = frameworks.flatMap((framework) =>
      framework.criteria.map((criterion) => ({
        frameworkId: framework.id,
        frameworkName: framework.name,
        criterionId: criterion.id,
        criterionName: criterion.name,
        description: criterion.description,
        weight: criterion.weight,
      }))
    );

    return {
      jobId: job.id,
      jobTitle: job.title,

      frameworks: frameworks.map((framework) => ({
        id: framework.id,
        name: framework.name,
      })),

      criteria,
    };
  }
}