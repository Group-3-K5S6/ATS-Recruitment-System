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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại.'),
  newPassword: z
    .string()
    .min(8, 'Mật khẩu mới phải tối thiểu 8 ký tự.')
    .regex(/[A-Z]/, 'Mật khẩu mới phải chứa ít nhất 1 chữ cái viết hoa (A-Z).')
    .regex(/[a-z]/, 'Mật khẩu mới phải chứa ít nhất 1 chữ cái viết thường (a-z).')
    .regex(/\d/, 'Mật khẩu mới phải chứa ít nhất 1 chữ số (0-9).')
    .regex(/[^A-Za-z0-9]/, 'Mật khẩu mới phải chứa ít nhất 1 ký tự đặc biệt.'),
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

  static async changePassword(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      errorResponse(res, 'Authentication required.', 401, 'UNAUTHORIZED');
      return;
    }

    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        passwordHistories: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!user) {
      errorResponse(res, 'User account not found.', 404, 'USER_NOT_FOUND');
      return;
    }

    // 1. Verify current password
    const isCurrentMatch = await comparePassword(currentPassword, user.passwordHash);
    if (!isCurrentMatch) {
      errorResponse(res, 'Mật khẩu hiện tại không đúng.', 400, 'INVALID_CURRENT_PASSWORD');
      return;
    }

    // 2. Check if new password matches current password
    if (currentPassword === newPassword) {
      errorResponse(res, 'Mật khẩu mới không được trùng với mật khẩu hiện tại.', 400, 'PASSWORD_REUSED');
      return;
    }

    const isSameAsCurrent = await comparePassword(newPassword, user.passwordHash);
    if (isSameAsCurrent) {
      errorResponse(res, 'Mật khẩu mới không được trùng với mật khẩu hiện tại.', 400, 'PASSWORD_REUSED');
      return;
    }

    // 3. Check password history (cannot reuse recent old passwords)
    for (const history of user.passwordHistories) {
      const isHistoricalMatch = await comparePassword(newPassword, history.passwordHash);
      if (isHistoricalMatch) {
        errorResponse(res, 'Mật khẩu mới không được trùng với các mật khẩu đã sử dụng gần đây.', 400, 'PASSWORD_REUSED');
        return;
      }
    }

    // 4. Update password & record history
    const newPasswordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash: user.passwordHash,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      }),
    ]);

    // 5. Revoke current token (revoke session)
    if (req.token) {
      await revokeToken(req.token);
    }

    // 6. Record audit log
    await recordRequestAudit(req, AuditAction.PASSWORD_CHANGED, 'user', user.id, {
      email: user.email,
    });

    successResponse(
      res,
      { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại với mật khẩu mới.' },
      200,
      'Password updated successfully.'
    );
  }
}
