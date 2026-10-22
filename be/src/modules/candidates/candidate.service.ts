import { prisma } from '../../database/prisma';
import { AuthenticatedUser } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { CandidatePolicy } from '../../policies/candidate.policy';
import { Prisma } from '@prisma/client';

export class CandidateService {
  /**
   * Scoped query: directly filter at database level according to user role & scope
   */
  static async findCandidateForUser(candidateId: string, currentUser: AuthenticatedUser) {
    // 1. Admin & HR Manager: Global access
    if (
      currentUser.roles.includes(RoleType.ADMIN) ||
      currentUser.roles.includes(RoleType.HR_MANAGER)
    ) {
      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: {
          applications: {
            include: {
              job: true,
              interviews: true,
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // Recruiter: only candidates attached to assigned requisitions.
    // Filter the INCLUDED applications as well; otherwise an allowed candidate
    // would leak their applications to other jobs and departments.
    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      const assignmentScope = CandidatePolicy.recruiterApplicationWhere(currentUser.id);
      const candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: assignmentScope } },
        include: {
          applications: {
            where: assignmentScope,
            include: { job: true, interviews: true },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // 2. Candidate: Only their own profile
    if (currentUser.roles.includes(RoleType.CANDIDATE)) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          id: candidateId,
          userId: currentUser.id,
        },
        include: {
          applications: {
            include: {
              job: true,
              interviews: true,
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // 3. Hiring Manager: Candidate must have applied to a job in their department or managed by them
    if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          id: candidateId,
          applications: {
            some: {
              job: {
                OR: [
                  { hiringManagerId: currentUser.id },
                  currentUser.departmentId ? { departmentId: currentUser.departmentId } : {},
                ],
              },
            },
          },
        },
        include: {
          applications: {
            include: {
              job: true,
              interviews: true,
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // 4. Interviewer: Candidate must be scheduled for an interview with this interviewer
    if (currentUser.roles.includes(RoleType.INTERVIEWER)) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          id: candidateId,
          applications: {
            some: {
              interviews: {
                some: {
                  interviewerId: currentUser.id,
                },
              },
            },
          },
        },
        include: {
          applications: {
            include: {
              job: true,
              interviews: {
                where: { interviewerId: currentUser.id },
              },
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // 5. Approver: Candidates with pending offers or in approval workflow
    if (currentUser.roles.includes(RoleType.APPROVER)) {
      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: {
          applications: {
            include: {
              job: true,
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Unified profile include helper — shared between role branches
  // ---------------------------------------------------------------------------

  /**
   * Full include for unified profile (applications + job + requisition +
   * interviews + evaluations + offers). Callers may add a `where` clause on
   * `applications` to scope by role.
   */
  private static unifiedProfileInclude(applicationWhere?: Prisma.ApplicationWhereInput) {
    return {
      applications: {
        where: applicationWhere,
        orderBy: { createdAt: 'desc' as const },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              status: true,
              location: true,
              applicationDeadline: true,
              departmentId: true,
              hiringManagerId: true,
              recruiterId: true,
              createdAt: true,
              department: { select: { id: true, name: true, code: true } },
              hiringManager: { select: { id: true, fullName: true, email: true } },
            },
          },
          interviews: {
            orderBy: { scheduledAt: 'asc' as const },
            include: {
              interviewer: { select: { id: true, fullName: true, email: true } },
              evaluations: {
                select: {
                  id: true,
                  score: true,
                  technicalNotes: true,
                  culturalNotes: true,
                  recommendation: true,
                  createdAt: true,
                  // Do NOT expose interviewerId — redundant and already on Interview
                },
              },
            },
          },
          offers: {
            orderBy: { createdAt: 'desc' as const },
            select: {
              id: true,
              status: true,
              baseSalary: true,
              createdAt: true,
              updatedAt: true,
              // internalNotes intentionally omitted — sanitised later per role
            },
          },
        },
      },
    } satisfies Prisma.CandidateInclude;
  }

  /**
   * S4-09: chỉ liệt kê các ứng viên và vị trí thuộc đúng phạm vi được giao.
   * Không trả về dữ liệu liên hệ, CV hoặc lịch sử tuyển dụng ở bước liệt kê.
   */
  static async listUnifiedProfiles(currentUser: AuthenticatedUser) {
    let applicationScope: Prisma.ApplicationWhereInput;

    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      applicationScope = CandidatePolicy.recruiterApplicationWhere(currentUser.id);
    } else if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      applicationScope = { job: { hiringManagerId: currentUser.id } };
    } else {
      return null;
    }

    return prisma.candidate.findMany({
      where: { applications: { some: applicationScope } },
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        applications: {
          where: applicationScope,
          select: {
            id: true,
            jobId: true,
            job: { select: { id: true, title: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * S4-09: quyền MỞ được kiểm tra theo vị trí được giao. Khi đã có quyền,
   * hiển thị đầy đủ các lần ứng tuyển trước đây của cùng ứng viên (AC2).
   */
  static async getUnifiedProfile(candidateId: string, currentUser: AuthenticatedUser) {
    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      const applicationScope = CandidatePolicy.recruiterApplicationWhere(currentUser.id);
      const candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: applicationScope } },
        include: CandidateService.unifiedProfileInclude(),
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      // Scope by the exact hiringManagerId, not by department membership.
      const applicationScope: Prisma.ApplicationWhereInput = {
        job: { hiringManagerId: currentUser.id },
      };
      const candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: applicationScope } },
        include: CandidateService.unifiedProfileInclude(),
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    return null;
  }

  /**
   * Scoped candidate listing: retrieves only candidates within user scope
   */
  static async listCandidatesForUser(currentUser: AuthenticatedUser) {
    if (
      currentUser.roles.includes(RoleType.ADMIN) ||
      currentUser.roles.includes(RoleType.HR_MANAGER)
    ) {
      const candidates = await prisma.candidate.findMany({
        include: {
          applications: {
            include: { job: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      const assignmentScope = CandidatePolicy.recruiterApplicationWhere(currentUser.id);
      const candidates = await prisma.candidate.findMany({
        where: { applications: { some: assignmentScope } },
        include: {
          applications: {
            where: assignmentScope,
            include: { job: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.CANDIDATE)) {
      const candidates = await prisma.candidate.findMany({
        where: { userId: currentUser.id },
        include: {
          applications: {
            include: { job: true },
          },
        },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      const candidates = await prisma.candidate.findMany({
        where: {
          applications: {
            some: {
              job: {
                OR: [
                  { hiringManagerId: currentUser.id },
                  currentUser.departmentId ? { departmentId: currentUser.departmentId } : {},
                ],
              },
            },
          },
        },
        include: {
          applications: {
            include: { job: true },
          },
        },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.INTERVIEWER)) {
      const candidates = await prisma.candidate.findMany({
        where: {
          applications: {
            some: {
              interviews: {
                some: {
                  interviewerId: currentUser.id,
                },
              },
            },
          },
        },
        include: {
          applications: {
            include: {
              job: true,
              interviews: {
                where: { interviewerId: currentUser.id },
              },
            },
          },
        },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.APPROVER)) {
      const candidates = await prisma.candidate.findMany({
        include: {
          applications: {
            include: { job: true },
          },
        },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    return [];
  }
}
