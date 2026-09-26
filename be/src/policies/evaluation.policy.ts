import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { prisma } from '../database/prisma';

export class EvaluationPolicy {
  static async canView(user: AuthenticatedUser, evaluationId: string): Promise<boolean> {
    // Candidates are NEVER allowed to view evaluation notes
    if (user.roles.includes(RoleType.CANDIDATE)) {
      return false;
    }

    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER) ||
      user.roles.includes(RoleType.APPROVER)
    ) {
      return true;
    }

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        interview: {
          include: {
            application: {
              include: { job: true },
            },
          },
        },
      },
    });

    if (!evaluation) return false;

    // Interviewer can view their own evaluation
    if (user.roles.includes(RoleType.INTERVIEWER)) {
      return evaluation.interviewerId === user.id;
    }

    // Hiring Manager can view evaluation for jobs in their department
    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      const job = evaluation.interview.application.job;
      return (
        job.hiringManagerId === user.id ||
        (!!user.departmentId && job.departmentId === user.departmentId)
      );
    }

    return false;
  }

  static async canSubmit(user: AuthenticatedUser, interviewId: string): Promise<boolean> {
    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      return true;
    }

    if (user.roles.includes(RoleType.INTERVIEWER)) {
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
      });
      return interview?.interviewerId === user.id;
    }

    return false;
  }
}
