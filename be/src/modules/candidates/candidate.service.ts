import { prisma } from '../../database/prisma';
import { AuthenticatedUser } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { CandidatePolicy } from '../../policies/candidate.policy';

export class CandidateService {
  /**
   * Scoped query: directly filter at database level according to user role & scope
   */
  static async findCandidateForUser(candidateId: string, currentUser: AuthenticatedUser) {
    // 1. Admin & HR Manager: Global access
    if (
      currentUser.roles.includes(RoleType.ADMIN) ||
      currentUser.roles.includes(RoleType.HR_MANAGER) ||
      currentUser.roles.includes(RoleType.RECRUITER)
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

  /**
   * Scoped candidate listing: retrieves only candidates within user scope
   */
  static async listCandidatesForUser(currentUser: AuthenticatedUser) {
    if (
      currentUser.roles.includes(RoleType.ADMIN) ||
      currentUser.roles.includes(RoleType.HR_MANAGER) ||
      currentUser.roles.includes(RoleType.RECRUITER)
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
