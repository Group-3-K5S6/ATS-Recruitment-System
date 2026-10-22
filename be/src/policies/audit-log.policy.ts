import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';

export class AuditLogPolicy {
  static canRead(user: AuthenticatedUser): boolean {
    return user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER);
  }

  static canDelete(user: AuthenticatedUser): boolean {
    // Only Admin has full privileges on audit logs, but audit logs are strictly immutable for general actors
    return user.roles.includes(RoleType.ADMIN);
  }
}
