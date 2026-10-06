import { Request, Response, NextFunction } from 'express';
import { PermissionCode } from '../rbac/permissions';
import { RoleType } from '../rbac/roles';
import { errorResponse } from '../utils/response';

/**
 * Authorization Guard checking if authenticated user has required permission
 */
export function requirePermission(...requiredPermissions: PermissionCode[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      errorResponse(res, 'Authentication required before authorization.', 401, 'UNAUTHORIZED');
      return;
    }

    // Admin has full system access
    if (req.user.roles.includes(RoleType.ADMIN)) {
      next();
      return;
    }

    const hasPermission = requiredPermissions.some((perm) =>
      req.user!.permissions.includes(perm)
    );

    if (!hasPermission) {
      errorResponse(
        res,
        'Access denied. You do not have the required permission for this resource.',
        403,
        'FORBIDDEN_PERMISSION'
      );
      return;
    }

    next();
  };
}

/**
 * Authorization Guard checking if user has specific role
 */
export function requireRole(...requiredRoles: RoleType[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      errorResponse(res, 'Authentication required before authorization.', 401, 'UNAUTHORIZED');
      return;
    }

    const hasRole = requiredRoles.some((role) => req.user!.roles.includes(role));

    if (!hasRole) {
      errorResponse(
        res,
        'Access denied. You do not have the required role for this action.',
        403,
        'FORBIDDEN_ROLE'
      );
      return;
    }

    next();
  };
}
