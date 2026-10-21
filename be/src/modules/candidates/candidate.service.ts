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
   * Sanitise unified-profile data per role.
   *  - CANDIDATE: remove internalNotes (already not selected) and
   *    evaluations (internal).
   *  - INTERVIEWER: apply the standard phone/salary/address mask plus
   *    hide evaluations written by others.
   *  - All other roles: return as-is (evaluations visible to RECRUITER,
   *    HR_MANAGER, ADMIN, HIRING_MANAGER, APPROVER).
   */
  private static sanitizeUnifiedProfile(user: AuthenticatedUser, profile: any): any {
    if (!profile) return null;

    // Strip evaluation details for CANDIDATE — they must never see internal review notes
    if (user.roles.includes(RoleType.CANDIDATE)) {
      const sanitisedApps = (profile.applications ?? []).map((app: any) => ({
        ...app,
        interviews: (app.interviews ?? []).map((iv: any) => {
          const { evaluations, ...ivWithout } = iv;
          return ivWithout;
        }),
      }));
      return CandidatePolicy.sanitize(user, { ...profile, applications: sanitisedApps });
    }

    // INTERVIEWER: mask personal fields + only show evaluations they wrote
    if (user.roles.includes(RoleType.INTERVIEWER)) {
      const sanitisedApps = (profile.applications ?? []).map((app: any) => ({
        ...app,
        interviews: (app.interviews ?? []).map((iv: any) => ({
          ...iv,
          evaluations: (iv.evaluations ?? []).filter(
            (_: any) => iv.interviewerId === user.id
          ),
        })),
      }));
      return CandidatePolicy.sanitize(user, { ...profile, applications: sanitisedApps });
    }

    // RECRUITER, HR_MANAGER, ADMIN, HIRING_MANAGER, APPROVER — full profile
    return CandidatePolicy.sanitize(user, profile);
  }

  /**
   * Returns the unified candidate profile for the requesting user, scoped by
   * their role. Returns null if the user has no access.
   */
  static async getUnifiedProfile(candidateId: string, currentUser: AuthenticatedUser) {
    // 1. ADMIN & HR_MANAGER — global access, all applications
    if (
      currentUser.roles.includes(RoleType.ADMIN) ||
      currentUser.roles.includes(RoleType.HR_MANAGER)
    ) {
      const profile = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: CandidateService.unifiedProfileInclude(),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 2. RECRUITER — only candidates linked to assigned requisitions (S3-06)
    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      const scopeWhere = CandidatePolicy.recruiterApplicationWhere(currentUser.id);
      const profile = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: scopeWhere } },
        include: CandidateService.unifiedProfileInclude(scopeWhere),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 3. CANDIDATE — own profile only
    if (currentUser.roles.includes(RoleType.CANDIDATE)) {
      const profile = await prisma.candidate.findFirst({
        where: { id: candidateId, userId: currentUser.id },
        include: CandidateService.unifiedProfileInclude(),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 4. HIRING_MANAGER — candidates who applied to their department's jobs
    if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      const scopeWhere: Prisma.ApplicationWhereInput = {
        job: {
          OR: [
            { hiringManagerId: currentUser.id },
            ...(currentUser.departmentId ? [{ departmentId: currentUser.departmentId }] : []),
          ],
        },
      };
      const profile = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: scopeWhere } },
        include: CandidateService.unifiedProfileInclude(scopeWhere),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 5. INTERVIEWER — candidates assigned to them for an interview
    if (currentUser.roles.includes(RoleType.INTERVIEWER)) {
      const scopeWhere: Prisma.ApplicationWhereInput = {
        interviews: { some: { interviewerId: currentUser.id } },
      };
      const profile = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: scopeWhere } },
        // Include ALL the candidate's applications so context is complete,
        // but filter interviews to those involving this interviewer.
        include: CandidateService.unifiedProfileInclude({
          interviews: { some: { interviewerId: currentUser.id } },
        }),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 6. APPROVER — full read (same as existing policy)
    if (currentUser.roles.includes(RoleType.APPROVER)) {
      const profile = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: CandidateService.unifiedProfileInclude(),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
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
