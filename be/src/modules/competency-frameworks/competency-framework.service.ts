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

type FrameworkWithRelations = Prisma.CompetencyFrameworkGetPayload<{
  include: {
    criteria: true;
    jobMappings: {
      include: {
        job: {
          include: { department: true };
        };
      };
    };
  };
}>;

export class CompetencyFrameworkService {
  /**
   * Helper to format framework model to response DTO
   */
  private static formatFramework(framework: FrameworkWithRelations): CompetencyFrameworkResponse {
    const criteria: CriterionResponse[] = (framework.criteria || []).map((c) => ({
      id: c.id,
      frameworkId: c.frameworkId,
      name: c.name,
      description: c.description,
      weight: c.weight,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    const totalWeight = Number(
      criteria.reduce((sum: number, c) => sum + c.weight, 0).toFixed(2)
    );

    const jobs = (framework.jobMappings || []).map((jm) => ({
      id: jm.job.id,
      title: jm.job.title,
      departmentId: jm.job.departmentId,
      departmentName: jm.job.department?.name,
      status: jm.job.status,
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
      jobs,
    };
  }

  /**
   * List all competency frameworks with optional filters
   */
  static async listFrameworks(query: {
    search?: string;
    includeInactive?: boolean;
    jobId?: string;
  }): Promise<CompetencyFrameworkResponse[]> {
    const where: Prisma.CompetencyFrameworkWhereInput = {};

    if (!query.includeInactive) {
      where.isActive = true;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }

    if (query.jobId) {
      where.jobMappings = {
        some: { jobId: query.jobId },
      };
    }

    const frameworks = await prisma.competencyFramework.findMany({
      where,
      include: {
        criteria: {
          orderBy: { createdAt: 'asc' },
        },
        jobMappings: {
          include: {
            job: {
              include: { department: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return frameworks.map((f) => CompetencyFrameworkService.formatFramework(f));
  }

  /**
   * Get single framework by ID
   */
  static async getFrameworkById(id: string): Promise<CompetencyFrameworkResponse | null> {
    const framework = await prisma.competencyFramework.findUnique({
      where: { id },
      include: {
        criteria: {
          orderBy: { createdAt: 'asc' },
        },
        jobMappings: {
          include: {
            job: {
              include: { department: true },
            },
          },
        },
      },
    });

    if (!framework) {
      return null;
    }

    return CompetencyFrameworkService.formatFramework(framework);
  }

  /**
   * Create a new competency framework with criteria and optional job mappings
   */
  static async createFramework(
    data: CreateCompetencyFrameworkDTO,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    if (!data.criteria || data.criteria.length === 0) {
      throw new AppError('Framework must contain at least one criterion.', 400, 'VALIDATION_ERROR');
    }

    for (const c of data.criteria) {
      if (c.weight <= 0 || c.weight > 100) {
        throw new AppError(
          `Criterion weight must be between 0 and 100. Invalid weight: ${c.weight} for "${c.name}".`,
          400,
          'VALIDATION_ERROR'
        );
      }
    }

    const seenNames = new Set<string>();
    for (const c of data.criteria) {
      const lower = c.name.trim().toLowerCase();
      if (seenNames.has(lower)) {
        throw new AppError(
          `Duplicate criterion name "${c.name}" within framework.`,
          400,
          'DUPLICATE_CRITERION'
        );
      }
      seenNames.add(lower);
    }

    const totalWeight = data.criteria.reduce((sum, item) => sum + item.weight, 0);
    if (Math.abs(Number(totalWeight.toFixed(4)) - 100) > 0.001) {
      throw new AppError(
        `Total criteria weight must equal 100%. Current sum: ${Number(totalWeight.toFixed(2))}%.`,
        400,
        'INVALID_WEIGHT_SUM'
      );
    }

    if (data.jobIds && data.jobIds.length > 0) {
      const existingJobs = await prisma.job.findMany({
        where: { id: { in: data.jobIds } },
        select: { id: true },
      });
      if (existingJobs.length !== data.jobIds.length) {
        throw new AppError('One or more assigned jobs do not exist.', 400, 'JOB_NOT_FOUND');
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const framework = await tx.competencyFramework.create({
        data: {
          name: data.name.trim(),
          description: data.description?.trim() || null,
          isActive: data.isActive !== undefined ? data.isActive : true,
          criteria: {
            create: data.criteria.map((c) => ({
              name: c.name.trim(),
              description: c.description?.trim() || null,
              weight: c.weight,
            })),
          },
          jobMappings:
            data.jobIds && data.jobIds.length > 0
              ? {
                  create: data.jobIds.map((jobId) => ({
                    jobId,
                  })),
                }
              : undefined,
        },
        include: {
          criteria: {
            orderBy: { createdAt: 'asc' },
          },
          jobMappings: {
            include: {
              job: {
                include: { department: true },
              },
            },
          },
        },
      });

      return framework;
    });

    return CompetencyFrameworkService.formatFramework(created);
  }

  /**
   * Update framework details, criteria, and job mappings
   */
  static async updateFramework(
    id: string,
    data: UpdateCompetencyFrameworkDTO,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const existing = await prisma.competencyFramework.findUnique({
      where: { id },
      include: {
        criteria: true,
        jobMappings: true,
      },
    });

    if (!existing) {
      throw new AppError('Competency framework not found.', 404, 'NOT_FOUND');
    }

    if (data.criteria && data.criteria.length > 0) {
      for (const c of data.criteria) {
        if (c.weight <= 0 || c.weight > 100) {
          throw new AppError(
            `Criterion weight must be between 0 and 100. Invalid weight: ${c.weight} for "${c.name}".`,
            400,
            'VALIDATION_ERROR'
          );
        }
      }

      const seenNames = new Set<string>();
      for (const c of data.criteria) {
        const lower = c.name.trim().toLowerCase();
        if (seenNames.has(lower)) {
          throw new AppError(
            `Duplicate criterion name "${c.name}" within framework.`,
            400,
            'DUPLICATE_CRITERION'
          );
        }
        seenNames.add(lower);
      }

      const totalWeight = data.criteria.reduce((sum, item) => sum + item.weight, 0);
      if (Math.abs(Number(totalWeight.toFixed(4)) - 100) > 0.001) {
        throw new AppError(
          `Total criteria weight must equal 100%. Current sum: ${Number(totalWeight.toFixed(2))}%.`,
          400,
          'INVALID_WEIGHT_SUM'
        );
      }
    }

    if (data.jobIds && data.jobIds.length > 0) {
      const existingJobs = await prisma.job.findMany({
        where: { id: { in: data.jobIds } },
        select: { id: true },
      });
      if (existingJobs.length !== data.jobIds.length) {
        throw new AppError('One or more assigned jobs do not exist.', 400, 'JOB_NOT_FOUND');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update framework base info
      await tx.competencyFramework.update({
        where: { id },
        data: {
          name: data.name ? data.name.trim() : undefined,
          description: data.description !== undefined ? data.description?.trim() || null : undefined,
          isActive: data.isActive !== undefined ? data.isActive : undefined,
        },
      });

      // 2. Sync criteria if provided
      if (data.criteria && data.criteria.length > 0) {
        const incomingIds = data.criteria.filter((c) => !!c.id).map((c) => c.id as string);
        const criteriaToDelete = existing.criteria.filter((c) => !incomingIds.includes(c.id));

        for (const crit of criteriaToDelete) {
          const inUseQuestions = await tx.interviewQuestion.count({
            where: { competencyCriterionId: crit.id },
          });
          if (inUseQuestions > 0) {
            throw new AppError(
              `Cannot remove criterion "${crit.name}" because interview questions are referencing it.`,
              400,
              'CRITERION_IN_USE'
            );
          }
          await tx.competencyCriterion.delete({ where: { id: crit.id } });
        }

        for (const item of data.criteria) {
          if (item.id) {
            await tx.competencyCriterion.update({
              where: { id: item.id },
              data: {
                name: item.name.trim(),
                description: item.description?.trim() || null,
                weight: item.weight,
              },
            });
          } else {
            await tx.competencyCriterion.create({
              data: {
                frameworkId: id,
                name: item.name.trim(),
                description: item.description?.trim() || null,
                weight: item.weight,
              },
            });
          }
        }
      }

      // 3. Sync job mappings if provided
      if (data.jobIds !== undefined) {
        await tx.jobCompetencyFramework.deleteMany({
          where: { frameworkId: id },
        });

        if (data.jobIds.length > 0) {
          await tx.jobCompetencyFramework.createMany({
            data: data.jobIds.map((jobId) => ({
              jobId,
              frameworkId: id,
            })),
          });
        }
      }

      const finalFramework = await tx.competencyFramework.findUniqueOrThrow({
        where: { id },
        include: {
          criteria: {
            orderBy: { createdAt: 'asc' },
          },
          jobMappings: {
            include: {
              job: {
                include: { department: true },
              },
            },
          },
        },
      });

      return finalFramework;
    });

    return CompetencyFrameworkService.formatFramework(updated);
  }

  /**
   * Delete or deactivate framework
   * If framework is in use by jobs or interview questions:
   *  - permanent=true -> reject with 400 error (FRAMEWORK_IN_USE)
   *  - permanent=false -> soft delete / deactivate (isActive = false)
   * If not in use:
   *  - hard delete from database
   */
  static async deleteFramework(
    id: string,
    permanent = false,
    _user: AuthenticatedUser
  ): Promise<{ message: string; deactivated?: boolean; deleted?: boolean }> {
    const framework = await prisma.competencyFramework.findUnique({
      where: { id },
      include: {
        jobMappings: true,
        criteria: {
          select: { id: true },
        },
      },
    });

    if (!framework) {
      throw new AppError('Competency framework not found.', 404, 'NOT_FOUND');
    }

    const hasJobs = framework.jobMappings.length > 0;
    const criterionIds = framework.criteria.map((c) => c.id);
    const questionsCount =
      criterionIds.length > 0
        ? await prisma.interviewQuestion.count({
            where: { competencyCriterionId: { in: criterionIds } },
          })
        : 0;

    const isInUse = hasJobs || questionsCount > 0;

    if (permanent) {
      if (isInUse) {
        throw new AppError(
          'Cannot permanently delete competency framework that is in use by jobs or interview questions.',
          400,
          'FRAMEWORK_IN_USE'
        );
      }

      await prisma.competencyFramework.delete({
        where: { id },
      });

      return {
        message: 'Competency framework permanently deleted successfully.',
        deleted: true,
      };
    } else {
      await prisma.competencyFramework.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        message: 'Competency framework deactivated successfully.',
        deactivated: true,
      };
    }
  }

  /**
   * Add a single criterion to a framework
   */
  static async addCriterion(
    frameworkId: string,
    data: CreateCriterionDTO,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: { id: frameworkId },
      include: { criteria: true },
    });

    if (!framework) {
      throw new AppError('Competency framework not found.', 404, 'NOT_FOUND');
    }

    if (data.weight <= 0 || data.weight > 100) {
      throw new AppError('Criterion weight must be between 0 and 100.', 400, 'VALIDATION_ERROR');
    }

    const lowerName = data.name.trim().toLowerCase();
    if (framework.criteria.some((c) => c.name.trim().toLowerCase() === lowerName)) {
      throw new AppError(
        `Duplicate criterion name "${data.name}" within framework.`,
        400,
        'DUPLICATE_CRITERION'
      );
    }

    const currentSum = framework.criteria.reduce((s, c) => s + c.weight, 0);
    const newTotal = currentSum + data.weight;
    if (Math.abs(Number(newTotal.toFixed(4)) - 100) > 0.001) {
      throw new AppError(
        `Total criteria weight of framework must equal 100%. Current total would be ${Number(newTotal.toFixed(2))}%.`,
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

    const refreshed = await CompetencyFrameworkService.getFrameworkById(frameworkId);
    return refreshed!;
  }

  /**
   * Update a single criterion in a framework
   */
  static async updateCriterion(
    frameworkId: string,
    criterionId: string,
    data: UpdateCriterionDTO,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: { id: frameworkId },
      include: { criteria: true },
    });

    if (!framework) {
      throw new AppError('Competency framework not found.', 404, 'NOT_FOUND');
    }

    const criterion = framework.criteria.find((c) => c.id === criterionId);
    if (!criterion) {
      throw new AppError('Criterion not found in this framework.', 404, 'CRITERION_NOT_FOUND');
    }

    if (data.weight !== undefined && (data.weight <= 0 || data.weight > 100)) {
      throw new AppError('Criterion weight must be between 0 and 100.', 400, 'VALIDATION_ERROR');
    }

    if (data.name) {
      const lowerName = data.name.trim().toLowerCase();
      if (
        framework.criteria.some(
          (c) => c.id !== criterionId && c.name.trim().toLowerCase() === lowerName
        )
      ) {
        throw new AppError(
          `Duplicate criterion name "${data.name}" within framework.`,
          400,
          'DUPLICATE_CRITERION'
        );
      }
    }

    if (data.weight !== undefined) {
      const otherSum = framework.criteria
        .filter((c) => c.id !== criterionId)
        .reduce((s, c) => s + c.weight, 0);
      const newTotal = otherSum + data.weight;
      if (Math.abs(Number(newTotal.toFixed(4)) - 100) > 0.001) {
        throw new AppError(
          `Total criteria weight of framework must equal 100%. Current total would be ${Number(newTotal.toFixed(2))}%.`,
          400,
          'INVALID_WEIGHT_SUM'
        );
      }
    }

    await prisma.competencyCriterion.update({
      where: { id: criterionId },
      data: {
        name: data.name ? data.name.trim() : undefined,
        description: data.description !== undefined ? data.description?.trim() || null : undefined,
        weight: data.weight,
      },
    });

    const refreshed = await CompetencyFrameworkService.getFrameworkById(frameworkId);
    return refreshed!;
  }

  /**
   * Delete a criterion from a framework
   */
  static async deleteCriterion(
    frameworkId: string,
    criterionId: string,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: { id: frameworkId },
      include: { criteria: true },
    });

    if (!framework) {
      throw new AppError('Competency framework not found.', 404, 'NOT_FOUND');
    }

    const criterion = framework.criteria.find((c) => c.id === criterionId);
    if (!criterion) {
      throw new AppError('Criterion not found in this framework.', 404, 'CRITERION_NOT_FOUND');
    }

    const inUseQuestions = await prisma.interviewQuestion.count({
      where: { competencyCriterionId: criterionId },
    });
    if (inUseQuestions > 0) {
      throw new AppError(
        'Cannot delete criterion because interview questions are referencing it.',
        400,
        'CRITERION_IN_USE'
      );
    }

    if (framework.criteria.length <= 1) {
      throw new AppError(
        'Cannot delete the only criterion of the framework. A framework must have at least one criterion.',
        400,
        'CANNOT_DELETE_LAST_CRITERION'
      );
    }

    const remainingSum = framework.criteria
      .filter((c) => c.id !== criterionId)
      .reduce((s, c) => s + c.weight, 0);

    if (Math.abs(Number(remainingSum.toFixed(4)) - 100) > 0.001) {
      throw new AppError(
        `Cannot delete criterion because the remaining total weight (${Number(remainingSum.toFixed(2))}%) would not equal 100%. Please update the framework criteria or adjust remaining weights.`,
        400,
        'INVALID_WEIGHT_SUM'
      );
    }

    await prisma.competencyCriterion.delete({
      where: { id: criterionId },
    });

    const refreshed = await CompetencyFrameworkService.getFrameworkById(frameworkId);
    return refreshed!;
  }

  /**
   * Assign jobs to a competency framework (N:N relationship)
   */
  static async assignJobs(
    frameworkId: string,
    jobIds: string[],
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: { id: frameworkId },
    });

    if (!framework) {
      throw new AppError('Competency framework not found.', 404, 'NOT_FOUND');
    }

    const existingJobs = await prisma.job.findMany({
      where: { id: { in: jobIds } },
      select: { id: true },
    });

    if (existingJobs.length !== jobIds.length) {
      throw new AppError('One or more specified jobs do not exist.', 400, 'JOB_NOT_FOUND');
    }

    for (const jobId of jobIds) {
      await prisma.jobCompetencyFramework.upsert({
        where: {
          jobId_frameworkId: {
            jobId,
            frameworkId,
          },
        },
        update: {},
        create: {
          jobId,
          frameworkId,
        },
      });
    }

    const refreshed = await CompetencyFrameworkService.getFrameworkById(frameworkId);
    return refreshed!;
  }

  /**
   * Remove a job from a competency framework
   */
  static async removeJob(
    frameworkId: string,
    jobId: string,
    _user: AuthenticatedUser
  ): Promise<CompetencyFrameworkResponse> {
    const framework = await prisma.competencyFramework.findUnique({
      where: { id: frameworkId },
    });

    if (!framework) {
      throw new AppError('Competency framework not found.', 404, 'NOT_FOUND');
    }

    await prisma.jobCompetencyFramework.deleteMany({
      where: {
        frameworkId,
        jobId,
      },
    });

    const refreshed = await CompetencyFrameworkService.getFrameworkById(frameworkId);
    return refreshed!;
  }

  /**
   * Sprint 6 Integration: Get criteria list for a specific job
   */
  static async getCriteriaForJob(jobId: string): Promise<JobCriteriaResponse> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        competencyFrameworks: {
          include: {
            framework: {
              include: {
                criteria: {
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!job) {
      throw new AppError('Job not found.', 404, 'NOT_FOUND');
    }

    const frameworks = job.competencyFrameworks
      .map((jcf) => jcf.framework)
      .filter((f) => f.isActive);

    const allCriteria = frameworks.flatMap((f) =>
      f.criteria.map((c) => ({
        frameworkId: f.id,
        frameworkName: f.name,
        criterionId: c.id,
        criterionName: c.name,
        description: c.description,
        weight: c.weight,
      }))
    );

    return {
      jobId: job.id,
      jobTitle: job.title,
      frameworks: frameworks.map((f) => ({ id: f.id, name: f.name })),
      criteria: allCriteria,
    };
  }
}
