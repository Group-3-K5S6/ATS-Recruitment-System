import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';

export class ReportPolicy {
  static canView(user: AuthenticatedUser): boolean {
    return (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.HIRING_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER) ||
      user.roles.includes(RoleType.APPROVER)
    );
  }

  static getReportScopeFilter(user: AuthenticatedUser): { departmentId?: string; recruiterId?: string } {
    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      return {}; // Global scope
    }

    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      return { departmentId: user.departmentId || undefined };
    }

    if (user.roles.includes(RoleType.RECRUITER)) {
      return { recruiterId: user.id };
    }

    return {};
  }
}
