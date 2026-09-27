import { prisma } from '../../database/prisma';
import { AuthenticatedUser } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { CandidatePolicy } from '../../policies/candidate.policy';

export class CandidateService {
  /**
   * Scoped query: directly filter at database level according to user role & scope
   */
  static async findCandidateForUser(
    candidateId: string,
    currentUser: AuthenticatedUser,
  ) {
    // 1. ADMIN và HR_MANAGER: được xem candidate bất kỳ
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

      return candidate
        ? CandidatePolicy.sanitize(currentUser, candidate)
        : null;
    }

    // 2. RECRUITER: chỉ được xem candidate có application
    // được assign cho recruiter hiện tại
    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          id: candidateId,
          applications: {
            some: {
              assignedRecruiterId: currentUser.id,
            },
          },
        },
        include: {
          applications: {
            where: {
              assignedRecruiterId: currentUser.id,
            },
            include: {
              job: true,
            },
          },
        },
      });

      return candidate
        ? CandidatePolicy.sanitize(currentUser, candidate)
        : null;
    }

    // 3. CANDIDATE: chỉ được xem profile của chính mình
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

      return candidate
        ? CandidatePolicy.sanitize(currentUser, candidate)
        : null;
    }

    // 4. HIRING_MANAGER:
    // chỉ được xem candidate thuộc job mình quản lý
    // hoặc thuộc department của mình
    if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          id: candidateId,
          applications: {
            some: {
              job: {
                OR: [
                  {
                    hiringManagerId: currentUser.id,
                  },
                  ...(currentUser.departmentId
                    ? [{ departmentId: currentUser.departmentId }]
                    : []),
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

      return candidate
        ? CandidatePolicy.sanitize(currentUser, candidate)
        : null;
    }

    // 5. INTERVIEWER:
    // chỉ được xem candidate có interview được assign cho mình
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
                where: {
                  interviewerId: currentUser.id,
                },
              },
            },
          },
        },
      });

      return candidate
        ? CandidatePolicy.sanitize(currentUser, candidate)
        : null;
    }

    // 6. APPROVER:
    // theo logic hiện tại: được xem candidate bất kỳ
    if (currentUser.roles.includes(RoleType.APPROVER)) {
      const candidate = await prisma.candidate.findUnique({
        where: {
          id: candidateId,
        },
        include: {
          applications: {
            include: {
              job: true,
            },
          },
        },
      });

      return candidate
        ? CandidatePolicy.sanitize(currentUser, candidate)
        : null;
    }

    // Role không có quyền
    return null;
  }

  /**
   * Scoped candidate listing: retrieves only candidates within user scope
   */
  static async listCandidatesForUser(currentUser: AuthenticatedUser) {
    // ADMIN và HR_MANAGER được xem toàn bộ candidates
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

      return candidates.map((candidate) =>
        CandidatePolicy.sanitize(currentUser, candidate),
      );
    }

    // RECRUITER chỉ được xem candidates
    // có application được phân công cho recruiter hiện tại
    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      const candidates = await prisma.candidate.findMany({
        where: {
          applications: {
            some: {
              assignedRecruiterId: currentUser.id,
            },
          },
        },
        include: {
          applications: {
            include: { job: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return candidates.map((candidate) =>
        CandidatePolicy.sanitize(currentUser, candidate),
      );
    }

    // CANDIDATE chỉ xem hồ sơ của chính mình
    if (currentUser.roles.includes(RoleType.CANDIDATE)) {
      const candidates = await prisma.candidate.findMany({
        where: { userId: currentUser.id },
        include: {
          applications: {
            include: { job: true },
          },
        },
      });

      return candidates.map((candidate) =>
        CandidatePolicy.sanitize(currentUser, candidate),
      );
    }

    // HIRING_MANAGER chỉ xem candidates thuộc job/requisition
    // mà mình quản lý hoặc thuộc department của mình
    if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      const candidates = await prisma.candidate.findMany({
        where: {
          applications: {
            some: {
              job: {
                OR: [
                  { hiringManagerId: currentUser.id },
                  currentUser.departmentId
                    ? { departmentId: currentUser.departmentId }
                    : {},
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

      return candidates.map((candidate) =>
        CandidatePolicy.sanitize(currentUser, candidate),
      );
    }

    // INTERVIEWER chỉ xem candidates thuộc các interview
    // mà mình tham gia
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

      return candidates.map((candidate) =>
        CandidatePolicy.sanitize(currentUser, candidate),
      );
    }

    // APPROVER
    if (currentUser.roles.includes(RoleType.APPROVER)) {
      const candidates = await prisma.candidate.findMany({
        include: {
          applications: {
            include: { job: true },
          },
        },
      });

      return candidates.map((candidate) =>
        CandidatePolicy.sanitize(currentUser, candidate),
      );
    }

    // Role không có quyền xem candidates
    return [];
  }
}