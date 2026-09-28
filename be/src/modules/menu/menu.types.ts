import { PermissionCode } from '../../rbac/permissions';
import { RoleType } from '../../rbac/roles';

export interface MenuItemConfig {
  key: string;
  label: string;
  path: string;
  icon: string;
  order: number;
  /**
   * Permissions required to view this menu item.
   * By default, having any listed permission grants access ('OR' logic),
   * unless permissionOperator is set to 'AND'.
   */
  requiredPermissions?: PermissionCode[];
  permissionOperator?: 'AND' | 'OR';

  /**
   * Roles specifically required to view this item (e.g., CANDIDATE).
   * If specified, user must possess at least one of these roles.
   */
  requiredRoles?: RoleType[];

  /**
   * Roles explicitly excluded from this item.
   * If a user only has excluded roles, this item is hidden.
   */
  excludedRoles?: RoleType[];

  /**
   * Submenu child items
   */
  children?: MenuItemConfig[];
}

export interface MenuItemResponse {
  key: string;
  label: string;
  path: string;
  icon: string;
  order: number;
  children: MenuItemResponse[];
}
