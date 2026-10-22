import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { PermissionCode } from '../rbac/permissions';
import { prisma } from '../database/prisma';

export class CompetencyFrameworkPolicy {
  /**
   * Check if user can view competency frameworks
   */
  static canView(user: AuthenticatedUser): boolean {
    if (user.roles.includes(RoleType.ADMIN)) {
      return true;
    }
    return user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_READ);
  }

  /**
   * Check if user can create competency frameworks
   */
  static canCreate(user: AuthenticatedUser): boolean {
    if (user.roles.includes(RoleType.ADMIN)) {
      return true;
    }
    return user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_CREATE);
  }

  /**
   * Check if user can update a competency framework
   */
  static async canUpdate(user: AuthenticatedUser, frameworkId: string): Promise<boolean> {
    if (
      !user.roles.includes(RoleType.ADMIN) &&
      !user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_UPDATE)
    ) {
      return false;
    }

    const framework = await prisma.competencyFramework.findUnique({
      where: { id: frameworkId },
    });
    return !!framework;
  }

  /**
   * Check if user can delete a competency framework
   */
  static async canDelete(user: AuthenticatedUser, frameworkId: string): Promise<boolean> {
    if (
      !user.roles.includes(RoleType.ADMIN) &&
      !user.permissions.includes(PermissionCode.COMPETENCY_FRAMEWORKS_DELETE)
    ) {
      return false;
    }

    const framework = await prisma.competencyFramework.findUnique({
      where: { id: frameworkId },
    });
    return !!framework;
  }
}
