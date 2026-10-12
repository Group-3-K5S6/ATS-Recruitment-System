import { Request, Response } from "express";
import { prisma } from "../../database/prisma";
import { ReportPolicy } from "../../policies/report.policy";
import { RoleType } from "../../rbac/roles";
import { successResponse, errorResponse } from "../../utils/response";
import type { Prisma } from "@prisma/client";


export class ReportController {
  // S1-05/S1-06: Admin dashboard uses live data, not demo figures.
  static async getAdminOverview(req: Request, res: Response): Promise<void> {
    if (!req.user?.roles.includes(RoleType.ADMIN)) {
      errorResponse(res, "Chỉ Quản trị hệ thống được xem thống kê này.", 403, "FORBIDDEN_ROLE");
      return;
    }

    try {
      const [totalUsers, roles, totalAuditLogs, recentLogs] = await Promise.all([
        prisma.user.count(),
        prisma.role.findMany({
          select: {
            name: true,
            users: {
              select: { user: { select: { isActive: true } } },
            },
          },
          orderBy: { name: "asc" },
        }),
        prisma.auditLog.count(),
        prisma.auditLog.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            createdAt: true,
            action: true,
            ipAddress: true,
            actor: { select: { fullName: true } },
          },
        }),
      ]);

      // Old SQLite databases may not have the Sprint 2 category table yet.
      // Never report a misleading zero when the table is absent.
      let totalCategories: number | null = null;
      let categoryWarning: string | null = null;
      try {
        totalCategories = await prisma.recruitmentCategory.count();
      } catch (error) {
        if ((error as { code?: string }).code === "P2021") {
          categoryWarning =
            "Bảng RecruitmentCategory chưa tồn tại. Cần cập nhật cấu trúc Database để xem số danh mục.";
        } else {
          throw error;
        }
      }

      successResponse(res, {
        totalUsers,
        totalRoles: roles.length,
        totalCategories,
        totalAuditLogs,
        categoryWarning,
        roleStats: roles.map((role) => ({
          role: role.name,
          count: role.users.length,
          activeCount: role.users.filter((relation) => relation.user.isActive).length,
        })),
        recentLogs: recentLogs.map((entry) => ({
          id: entry.id,
          createdAt: entry.createdAt.toISOString(),
          actorName: entry.actor?.fullName ?? "Hệ thống",
          action: entry.action,
          ipAddress: entry.ipAddress,
        })),
      });
    } catch (error) {
      console.error("Admin dashboard query failed:", error);
      errorResponse(res, "Không thể tải thống kê quản trị từ Database.", 500, "ADMIN_DASHBOARD_ERROR");
    }
  }

  static async getDashboard(
    req: Request,
    res: Response
  ): Promise<void> {
    const user = req.user!;

    if (!ReportPolicy.canView(user)) {
      errorResponse(
        res,
        "Access denied. You do not have report access.",
        403,
        "FORBIDDEN_ROLE"
      );
      return;
    }

        // Xac dinh quyen xem thong ke
    const canViewGlobal =
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER);

    let scope: {
      departmentId?: string;
      recruiterId?: string;
      approverId?: string;
    } = {};

    let jobWhere: Prisma.JobWhereInput = {};
    let candidateWhere: Prisma.CandidateWhereInput = {};
    let interviewWhere: Prisma.InterviewWhereInput = {};
    let offerWhere: Prisma.OfferWhereInput = {};

    if (!canViewGlobal) {
      if (user.roles.includes(RoleType.HIRING_MANAGER)) {
        const departmentId = user.departmentId;

        // Khong co phong ban thi tu choi, khong mo rong quyen.
        if (!departmentId) {
          errorResponse(
            res,
            "Tài khoản chưa được gán phòng ban.",
            403,
            "REPORT_SCOPE_MISSING"
          );
          return;
        }

        scope = { departmentId };

        jobWhere = {
          departmentId,
        };

        candidateWhere = {
          applications: {
            some: {
              job: { departmentId },
            },
          },
        };

        interviewWhere = {
          application: {
            job: { departmentId },
          },
        };

        offerWhere = {
          application: {
            job: { departmentId },
          },
        };
      } else if (user.roles.includes(RoleType.RECRUITER)) {
        scope = {
          recruiterId: user.id,
        };

        jobWhere = {
          recruiterId: user.id,
        };

        candidateWhere = {
          applications: {
            some: {
              assignedRecruiterId: user.id,
            },
          },
        };

        interviewWhere = {
          application: {
            assignedRecruiterId: user.id,
          },
        };

        offerWhere = {
          recruiterId: user.id,
        };
      } else if (user.roles.includes(RoleType.APPROVER)) {
        scope = {
          approverId: user.id,
        };

        jobWhere = {
          requisition: {
            is: {
              approverId: user.id,
            },
          },
        };

        candidateWhere = {
          applications: {
            some: {
              job: {
                requisition: {
                  is: {
                    approverId: user.id,
                  },
                },
              },
            },
          },
        };

        interviewWhere = {
          application: {
            job: {
              requisition: {
                is: {
                  approverId: user.id,
                },
              },
            },
          },
        };

        offerWhere = {
          approverId: user.id,
        };
      } else {
        errorResponse(
          res,
          "Không có phạm vi xem báo cáo phù hợp.",
          403,
          "REPORT_SCOPE_DENIED"
        );
        return;
      }
    }

    // Lay thong ke dung pham vi quyen
    const [
      totalJobs,
      totalCandidates,
      totalInterviews,
      totalOffers,
      totalRecruiters,
      budgetResult,
    ] = await Promise.all([
      prisma.job.count({
        where: jobWhere,
      }),

      prisma.candidate.count({
        where: candidateWhere,
      }),

      prisma.interview.count({
        where: interviewWhere,
      }),

      prisma.offer.count({
        where: offerWhere,
      }),

      canViewGlobal
        ? prisma.user.count({
            where: {
              isActive: true,
              roles: {
                some: {
                  role: {
                    name: RoleType.RECRUITER,
                  },
                },
              },
            },
          })
        : Promise.resolve(null),

      canViewGlobal
        ? prisma.requisition.aggregate({
            where: {
              status: "APPROVED",
            },
            _sum: {
              budget: true,
            },
          })
        : Promise.resolve(null),
    ]);

        // Thong ke tuyen dung theo phong ban
    // Chi Admin va HR Manager xem duoc du lieu toan he thong
    const departmentStats = canViewGlobal
      ? await (async () => {
          const [
            departments,
            publishedJobs,
            applications,
            acceptedOffers,
          ] = await Promise.all([
            prisma.department.findMany({
              where: { isActive: true },
              select: {
                id: true,
                name: true,
              },
            }),

            prisma.job.findMany({
              where: { status: "PUBLISHED" },
              select: {
                id: true,
                departmentId: true,
              },
            }),

            prisma.application.findMany({
              select: {
                id: true,
                candidateId: true,
                jobId: true,
              },
            }),

            prisma.offer.findMany({
              where: { status: "ACCEPTED" },
              select: {
                applicationId: true,
              },
            }),
          ]);

          const acceptedApplicationIds = new Set(
            acceptedOffers.map(
              (offer) => offer.applicationId
            )
          );

          return departments.map((department) => {
            const departmentJobIds = new Set(
              publishedJobs
                .filter(
                  (job) => job.departmentId === department.id
                )
                .map((job) => job.id)
            );

            const departmentApplications =
              applications.filter((application) =>
                departmentJobIds.has(application.jobId)
              );

            const uniqueCandidateIds = new Set(
              departmentApplications.map(
                (application) => application.candidateId
              )
            );

            const acceptedApplicationCount =
              departmentApplications.filter(
                (application) =>
                  acceptedApplicationIds.has(application.id)
              ).length;

            return {
              departmentId: department.id,
              departmentName: department.name,
              publishedJobs: departmentJobIds.size,
              candidateCount: uniqueCandidateIds.size,
              acceptedOffers: acceptedApplicationCount,
              status:
                departmentJobIds.size > 0
                  ? "Đang tuyển"
                  : "Chưa đăng tuyển",
            };
          });
        })()
      : null;
    // Thong ke hieu suat Recruiter tu Database.
    // Chi Admin va HR Manager duoc xem toan he thong.
    const recruiterStats = canViewGlobal
      ? (
          await prisma.user.findMany({
            where: {
              isActive: true,
              roles: {
                some: {
                  role: {
                    name: RoleType.RECRUITER,
                  },
                },
              },
            },
            select: {
              id: true,
              fullName: true,
              assignedJobs: {
                select: {
                  id: true,
                  status: true,
                },
              },
              assignedApplications: {
                select: {
                  candidateId: true,
                },
              },
              createdOffers: {
                where: {
                  status: "ACCEPTED",
                },
                select: {
                  applicationId: true,
                },
              },
            },
            orderBy: {
              fullName: "asc",
            },
          })
        ).map((recruiter) => ({
          recruiterId: recruiter.id,
          recruiterName: recruiter.fullName,
          assignedJobs: recruiter.assignedJobs.length,
          publishedJobs: recruiter.assignedJobs.filter(
            (job) => job.status === "PUBLISHED"
          ).length,
          candidateCount: new Set(
            recruiter.assignedApplications.map(
              (application) => application.candidateId
            )
          ).size,
          acceptedOffers: new Set(
            recruiter.createdOffers.map(
              (offer) => offer.applicationId
            )
          ).size,
        }))
      : null;

        successResponse(
      res,
      {
        scope,
        metrics: {
          totalJobs,
          totalCandidates,
          totalInterviews,
          totalOffers,
          totalRecruiters,
          approvedBudget: budgetResult?._sum.budget ?? null,
        },
        departmentStats,
        recruiterStats,
      },
      200
    );
  }
}