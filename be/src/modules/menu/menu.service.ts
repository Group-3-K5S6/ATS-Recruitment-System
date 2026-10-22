import { MenuItemConfig, MenuItemResponse } from './menu.types';
import { MENU_REGISTRY } from './menu.config';
import { AuthenticatedUser } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';

export class MenuService {
  /**
   * Determine if a menu item is accessible by the authenticated user.
   * Evaluates role exclusions, required roles, and required permissions
   * against the server-verified user identity.
   */
  static isItemAccessible(item: MenuItemConfig, user: AuthenticatedUser): boolean {
    const isAdmin = user.roles.includes(RoleType.ADMIN);

    // 1. Check excluded roles
    if (item.excludedRoles && item.excludedRoles.length > 0) {
      const userHasExcludedRole = item.excludedRoles.some((role) => user.roles.includes(role));
      if (userHasExcludedRole) {
        // If user also has another role that is NOT excluded, they can still view it if permitted
        const hasNonExcludedRole = user.roles.some((role) => !item.excludedRoles!.includes(role));
        if (!hasNonExcludedRole && !isAdmin) {
          return false;
        }
      }
    }

    // 2. Check required roles (if specified, user must possess at least one required role)
    if (item.requiredRoles && item.requiredRoles.length > 0) {
      const hasRequiredRole = item.requiredRoles.some((role) => user.roles.includes(role));
      if (!hasRequiredRole) {
        return false;
      }
    }

    // 3. Check required permissions
    if (item.requiredPermissions && item.requiredPermissions.length > 0) {
      // ADMIN bypasses permission checks (has full privileges across all modules)
      if (!isAdmin) {
        const operator = item.permissionOperator || 'OR';
        if (operator === 'AND') {
          const hasAll = item.requiredPermissions.every((perm) =>
            user.permissions.includes(perm)
          );
          if (!hasAll) return false;
        } else {
          const hasAny = item.requiredPermissions.some((perm) =>
            user.permissions.includes(perm)
          );
          if (!hasAny) return false;
        }
      }
    }

    return true;
  }

  /**
   * Retrieve filtered navigation menu for authenticated user.
   * Recursively filters top-level and child menu items according to user permissions.
   */
  static getMenuForUser(
    user: AuthenticatedUser,
    registry: MenuItemConfig[] = MENU_REGISTRY
  ): MenuItemResponse[] {
    const filterAndMap = (items: MenuItemConfig[]): MenuItemResponse[] => {
      return items
        .filter((item) => MenuService.isItemAccessible(item, user))
        .sort((a, b) => a.order - b.order)
        .map((item) => {
          const filteredChildren =
            item.children && item.children.length > 0
              ? filterAndMap(item.children)
              : [];

          return {
            key: item.key,
            label: item.label,
            path: item.path,
            icon: item.icon,
            order: item.order,
            children: filteredChildren,
          };
        });
    };

    return filterAndMap(registry);
  }
}
