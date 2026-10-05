import { Request, Response, NextFunction } from 'express';

import {
  verifyAccessToken,
  isTokenRevoked,
} from '../utils/token';

import { prisma } from '../database/prisma';
import { errorResponse } from '../utils/response';

import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { PermissionCode } from '../rbac/permissions';


// Mở rộng Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      token?: string;
    }
  }
}


export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {

  /* =========================================================
     1. LẤY BEARER TOKEN
  ========================================================= */

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    errorResponse(
      res,
      'Authentication required. Missing Bearer token.',
      401,
      'UNAUTHORIZED'
    );
    return;
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    errorResponse(
      res,
      'Authentication required. Token is empty.',
      401,
      'UNAUTHORIZED'
    );
    return;
  }


  /* =========================================================
     2. S1-02 - KIỂM TRA TOKEN BỊ REVOKE
  ========================================================= */

  const revoked = await isTokenRevoked(token);

  if (revoked) {
    errorResponse(
      res,
      'Token has been revoked. Please log in again.',
      401,
      'TOKEN_REVOKED'
    );
    return;
  }


  /* =========================================================
     3. KIỂM TRA JWT
  ========================================================= */

  const payload = verifyAccessToken(token);

  if (!payload) {
    errorResponse(
      res,
      'Invalid or expired token.',
      401,
      'INVALID_TOKEN'
    );
    return;
  }


  /* =========================================================
     4. LẤY USER + ROLE + PERMISSION
  ========================================================= */

  const user = await prisma.user.findUnique({
    where: {
      id: payload.userId,
    },

    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });


  if (!user || !user.isActive) {
    errorResponse(
      res,
      'User account not found or deactivated.',
      401,
      'ACCOUNT_INACTIVE'
    );
    return;
  }


  /* =========================================================
     5. S1-04 - KIỂM TRA TOKEN VERSION

     Token cũ trước khi triển khai S1-04:
     tokenVersion = 0

     Sau khi đổi mật khẩu:
     User.tokenVersion tăng lên.

     Token có version cũ sẽ không còn hợp lệ.
  ========================================================= */

  const tokenVersion = payload.tokenVersion ?? 0;

  if (tokenVersion !== user.tokenVersion) {
    errorResponse(
      res,
      'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.',
      401,
      'SESSION_INVALIDATED'
    );
    return;
  }


  /* =========================================================
     6. LẤY DANH SÁCH ROLE + PERMISSION
  ========================================================= */

  const roles: RoleType[] = [];
  const permissionSet = new Set<PermissionCode>();

  for (const userRole of user.roles) {

    const roleName = userRole.role.name as RoleType;

    roles.push(roleName);

    for (const rolePermission of userRole.role.permissions) {

      const permissionCode =
        rolePermission.permission.code as PermissionCode;

      permissionSet.add(permissionCode);
    }
  }


  /* =========================================================
     7. GẮN USER VÀ TOKEN VÀO REQUEST
  ========================================================= */

  req.user = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    departmentId: user.departmentId,
    roles,
    permissions: Array.from(permissionSet),
  };

  req.token = token;


  /* =========================================================
     8. CHO PHÉP REQUEST ĐI TIẾP
  ========================================================= */

  next();
}