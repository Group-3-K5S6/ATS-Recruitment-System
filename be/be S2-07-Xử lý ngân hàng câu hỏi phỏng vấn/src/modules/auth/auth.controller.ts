import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { comparePassword, hashPassword } from '../../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken, revokeToken } from '../../utils/token';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { PermissionCode } from '../../rbac/permissions';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  phone: z.string().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string(),
});

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      errorResponse(res, 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');
      return;
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      errorResponse(res, 'Invalid email or password.', 401, 'INVALID_CREDENTIALS');
      return;
    }

    const roles: RoleType[] = [];
    const permissionSet = new Set<PermissionCode>();

    for (const ur of user.roles) {
      roles.push(ur.role.name as RoleType);
      for (const rp of ur.role.permissions) {
        permissionSet.add(rp.permission.code as PermissionCode);
      }
    }

    const payload = { userId: user.id, email: user.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await recordRequestAudit(req, AuditAction.LOGIN, 'user', user.id, {
      email: user.email,
    });

    successResponse(
      res,
      {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          departmentId: user.departmentId,
          roles,
          permissions: Array.from(permissionSet),
        },
      },
      200,
      'Login successful'
    );
  }

  static async register(req: Request, res: Response): Promise<void> {
    const { email, password, fullName, phone } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      errorResponse(res, 'Email is already registered.', 409, 'EMAIL_EXISTS');
      return;
    }

    const passwordHash = await hashPassword(password);
    const candidateRole = await prisma.role.findUnique({ where: { name: RoleType.CANDIDATE } });

    if (!candidateRole) {
      errorResponse(res, 'Candidate role not configured.', 500, 'ROLE_MISSING');
      return;
    }

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        isActive: true,
        roles: {
          create: {
            roleId: candidateRole.id,
          },
        },
        candidateProfile: {
          create: {
            fullName,
            email,
            phone: phone || null,
          },
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
      },
    });

    await recordRequestAudit(req, AuditAction.USER_CREATED, 'user', newUser.id, {
      role: RoleType.CANDIDATE,
    });

    successResponse(res, newUser, 201, 'Registration successful. Candidate profile created.');
  }

  static async logout(req: Request, res: Response): Promise<void> {
    if (req.token) {
      await revokeToken(req.token);
    }

    if (req.user) {
      await recordRequestAudit(req, AuditAction.LOGOUT, 'user', req.user.id);
    }

    successResponse(res, { message: 'Logged out successfully' }, 200);
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    const payload = verifyRefreshToken(refreshToken);

    if (!payload) {
      errorResponse(res, 'Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
      return;
    }

    const newAccessToken = signAccessToken({ userId: payload.userId, email: payload.email });
    successResponse(res, { accessToken: newAccessToken }, 200);
  }

  static async me(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      errorResponse(res, 'Not authenticated', 401, 'UNAUTHORIZED');
      return;
    }

    successResponse(res, req.user, 200);
  }
}
