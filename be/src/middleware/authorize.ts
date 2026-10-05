import { Request, Response, NextFunction } from 'express';
import { PermissionCode } from '../rbac/permissions';
import { RoleType } from '../rbac/roles';
import { errorResponse } from '../utils/response';

/**
 * Kiểm tra quyền của người dùng.
 *
 * Nguyên tắc S1-05:
 * - Chưa đăng nhập -> từ chối.
 * - Không truyền quyền yêu cầu -> mặc định từ chối.
 * - Admin có toàn quyền.
 * - Thiếu quyền -> 403 với thông báo tiếng Việt.
 */
export function requirePermission(
  ...requiredPermissions: PermissionCode[]
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      errorResponse(
        res,
        'Bạn cần đăng nhập trước khi sử dụng chức năng này.',
        401,
        'UNAUTHORIZED'
      );
      return;
    }

    /*
     * Default deny:
     * Nếu route gọi middleware nhưng không khai báo quyền,
     * hệ thống không tự cho phép truy cập.
     */
    if (requiredPermissions.length === 0) {
      errorResponse(
        res,
        'Chức năng này chưa được cấp quyền truy cập.',
        403,
        'FORBIDDEN_DEFAULT_DENY'
      );
      return;
    }

    /*
     * Quản trị hệ thống có toàn quyền.
     */
    if (req.user.roles.includes(RoleType.ADMIN)) {
      next();
      return;
    }

    /*
     * Người dùng chỉ cần có ít nhất một quyền
     * trong danh sách quyền được yêu cầu.
     */
    const hasPermission = requiredPermissions.some(
      (permission) =>
        req.user!.permissions.includes(permission)
    );

    if (!hasPermission) {
      errorResponse(
        res,
        'Bạn không có quyền sử dụng chức năng này.',
        403,
        'FORBIDDEN_PERMISSION'
      );
      return;
    }

    next();
  };
}

/**
 * Kiểm tra vai trò của người dùng.
 *
 * Nguyên tắc:
 * - Chưa đăng nhập -> từ chối.
 * - Không truyền vai trò -> mặc định từ chối.
 * - Không đúng vai trò -> 403 tiếng Việt.
 */
export function requireRole(
  ...requiredRoles: RoleType[]
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      errorResponse(
        res,
        'Bạn cần đăng nhập trước khi sử dụng chức năng này.',
        401,
        'UNAUTHORIZED'
      );
      return;
    }

    /*
     * Default deny khi route không khai báo vai trò.
     */
    if (requiredRoles.length === 0) {
      errorResponse(
        res,
        'Chức năng này chưa được cấp vai trò truy cập.',
        403,
        'FORBIDDEN_DEFAULT_DENY'
      );
      return;
    }

    const hasRole = requiredRoles.some(
      (role) => req.user!.roles.includes(role)
    );

    if (!hasRole) {
      errorResponse(
        res,
        'Vai trò của bạn không được phép thực hiện chức năng này.',
        403,
        'FORBIDDEN_ROLE'
      );
      return;
    }

    next();
  };
}
