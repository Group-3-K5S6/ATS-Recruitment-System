import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { prisma } from '../database/prisma';

export class JobPolicy {
  static async canView(user: AuthenticatedUser, jobId: string): Promise<boolean> {
    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER) ||
      user.roles.includes(RoleType.APPROVER)
    ) {
      return true;
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) return false;

    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      return (
        job.hiringManagerId === user.id ||
        (!!user.departmentId && job.departmentId === user.departmentId)
      );
    }

    if (user.roles.includes(RoleType.CANDIDATE)) {
      return job.status === 'PUBLISHED';
    }

    return false;
  }

  static async canCreate(user: AuthenticatedUser): Promise<boolean> {
    return (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER)
    );
  }

  static async canUpdate(user: AuthenticatedUser, jobId: string): Promise<boolean> {
    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      return true;
    }

    if (user.roles.includes(RoleType.RECRUITER)) {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      return !job?.recruiterId || job.recruiterId === user.id;
    }

    return false;
  }
}
