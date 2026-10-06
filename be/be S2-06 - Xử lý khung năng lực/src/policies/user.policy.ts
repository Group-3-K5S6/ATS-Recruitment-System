import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';

export class UserPolicy {
  static canListUsers(user: AuthenticatedUser): boolean {
    return user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER);
  }

  static canManageUsers(user: AuthenticatedUser): boolean {
    return user.roles.includes(RoleType.ADMIN);
  }

  static canAssignRoles(user: AuthenticatedUser): boolean {
    return user.roles.includes(RoleType.ADMIN);
  }

  static canDisableUser(user: AuthenticatedUser, targetUserId: string): boolean {
    if (!user.roles.includes(RoleType.ADMIN)) {
      return false;
    }
    // Prevent admin from disabling themselves
    return user.id !== targetUserId;
  }
}
