import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, isTokenRevoked } from '../utils/token';
import { prisma } from '../database/prisma';
import { errorResponse } from '../utils/response';
import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { PermissionCode } from '../rbac/permissions';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      token?: string;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    errorResponse(res, 'Authentication required. Missing Bearer token.', 401, 'UNAUTHORIZED');
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    errorResponse(res, 'Authentication required. Token is empty.', 401, 'UNAUTHORIZED');
    return;
  }

  // Check token revocation
  const revoked = await isTokenRevoked(token);
  if (revoked) {
    errorResponse(res, 'Token has been revoked. Please log in again.', 401, 'TOKEN_REVOKED');
    return;
  }

  // Verify JWT
  const payload = verifyAccessToken(token);
  if (!payload) {
    errorResponse(res, 'Invalid or expired token.', 401, 'INVALID_TOKEN');
    return;
  }

  // Load user from database with roles & permissions
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
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
    errorResponse(res, 'User account not found or deactivated.', 401, 'ACCOUNT_INACTIVE');
    return;
  }

  const roles: RoleType[] = [];
  const permissionSet = new Set<PermissionCode>();

  for (const userRole of user.roles) {
    const roleName = userRole.role.name as RoleType;
    roles.push(roleName);

    for (const rp of userRole.role.permissions) {
      permissionSet.add(rp.permission.code as PermissionCode);
    }
  }

  req.user = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    departmentId: user.departmentId,
    roles,
    permissions: Array.from(permissionSet),
  };
  req.token = token;

  next();
}
