import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { prisma } from '../database/prisma';

export class InterviewPolicy {
  static async canView(user: AuthenticatedUser, interviewId: string): Promise<boolean> {
    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER)
    ) {
      return true;
    }

    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        application: {
          include: {
            candidate: true,
            job: true,
          },
        },
      },
    });

    if (!interview) return false;

    // Interviewer: only their own interview
    if (user.roles.includes(RoleType.INTERVIEWER)) {
      return interview.interviewerId === user.id;
    }

    // Candidate: only their own interview
    if (user.roles.includes(RoleType.CANDIDATE)) {
      return interview.application.candidate.userId === user.id;
    }

    // Hiring Manager: within their managed jobs
    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      return (
        interview.application.job.hiringManagerId === user.id ||
        (!!user.departmentId && interview.application.job.departmentId === user.departmentId)
      );
    }

    return false;
  }

  static async canManage(user: AuthenticatedUser): Promise<boolean> {
    return (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER)
    );
  }
}
