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
      'Bạn cần đăng nhập để sử dụng chức năng này.',
      401,
      'UNAUTHORIZED'
    );
    return;
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    errorResponse(
      res,
      'Thông tin đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
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
      'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.',
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
      'Phiên đăng nhập đã hết hạn hoặc không hợp lệ.',
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
      'Tài khoản không tồn tại hoặc đã bị khóa.',
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
   S1-02 - KIEM TRA PHIEN DANG NHAP 20 PHUT
========================================================= */

const sessionId = payload.sessionId;

if (typeof sessionId !== 'string' || !sessionId) {
  errorResponse(
    res,
    'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
    401,
    'SESSION_INVALIDATED'
  );
  return;
}

const authSession = await prisma.authSession.findUnique({
  where: {
    id: sessionId,
  },
});

const sessionNow = Date.now();
const idleTimeoutMs = 20 * 60 * 1000;

if (
  !authSession ||
  authSession.userId !== user.id ||
  authSession.revokedAt !== null ||
  authSession.expiresAt.getTime() <= sessionNow ||
  authSession.lastActivityAt.getTime() + idleTimeoutMs <= sessionNow
) {
  errorResponse(
    res,
    'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.',
    401,
    'SESSION_EXPIRED'
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