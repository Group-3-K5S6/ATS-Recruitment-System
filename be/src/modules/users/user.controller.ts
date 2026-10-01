import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { UserPolicy } from '../../policies/user.policy';
import { hashPassword } from '../../utils/password';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import sharp from 'sharp';
import { UploadedAvatarRequest } from './avatar-upload';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  departmentId: z.string().uuid().optional(),
  roles: z.array(z.nativeEnum(RoleType)).min(1),
});

export const assignRolesSchema = z.object({
  roles: z.array(z.nativeEnum(RoleType)).min(1),
});

export class UserController {
  private static readonly avatarMaxPixels = 40_000_000;

  private static canViewInternalAvatars(req: Request): boolean {
    return Boolean(req.user?.roles.some((role) => role !== RoleType.CANDIDATE));
  }

  static async uploadOwnAvatar(req: Request, res: Response): Promise<void> {
    if (!UserController.canViewInternalAvatars(req)) {
      errorResponse(res, 'Only internal employees can upload an avatar.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    const file = (req as UploadedAvatarRequest).file;
    if (!file) {
      errorResponse(res, 'Choose a JPG or PNG image to upload.', 400, 'AVATAR_REQUIRED');
      return;
    }

    try {
      const metadata = await sharp(file.buffer, {
        limitInputPixels: UserController.avatarMaxPixels,
        failOn: 'error',
      }).metadata();
      const mimeMatches =
        (metadata.format === 'jpeg' && file.mimetype === 'image/jpeg') ||
        (metadata.format === 'png' && file.mimetype === 'image/png');

      if (!mimeMatches) {
        errorResponse(res, 'The file contents must be a valid JPG or PNG image.', 415, 'INVALID_IMAGE');
        return;
      }

      const [squareImage, thumbnail] = await Promise.all([
        sharp(file.buffer, { limitInputPixels: UserController.avatarMaxPixels })
          .rotate()
          .resize(512, 512, { fit: 'cover', position: 'attention' })
          .webp({ quality: 84 })
          .toBuffer(),
        sharp(file.buffer, { limitInputPixels: UserController.avatarMaxPixels })
          .rotate()
          .resize(96, 96, { fit: 'cover', position: 'attention' })
          .webp({ quality: 78 })
          .toBuffer(),
      ]);

      const avatarUrl = `/api/users/${req.user!.id}/avatar`;
      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          avatarUrl,
          avatarImage: squareImage,
          avatarThumbnail: thumbnail,
        },
        select: { id: true, avatarUrl: true },
      });

      await recordRequestAudit(req, AuditAction.USER_UPDATED, 'user', updated.id, {
        changedField: 'avatar',
        sourceFormat: metadata.format,
      });

      successResponse(
        res,
        { ...updated, thumbnailUrl: `${avatarUrl}?size=thumbnail` },
        200,
        'Avatar uploaded successfully.'
      );
    } catch (error) {
      console.error('[Avatar processing error]:', error instanceof Error ? error.message : error);
      errorResponse(res, 'The image could not be processed. Choose a valid JPG or PNG.', 400, 'INVALID_IMAGE');
    }
  }

  static async getOwnAvatar(req: Request, res: Response): Promise<void> {
    await UserController.sendAvatar(req, res, req.user!.id);
  }

  static async getUserAvatar(req: Request, res: Response): Promise<void> {
    if (!UserController.canViewInternalAvatars(req)) {
      errorResponse(res, 'Only internal employees can view employee avatars.', 403, 'FORBIDDEN_ROLE');
      return;
    }
    await UserController.sendAvatar(req, res, req.params.id);
  }

  private static async sendAvatar(req: Request, res: Response, userId: string): Promise<void> {
    if (!UserController.canViewInternalAvatars(req)) {
      errorResponse(res, 'Only internal employees can view employee avatars.', 403, 'FORBIDDEN_ROLE');
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarImage: true, avatarThumbnail: true },
    });
    if (!user) {
      errorResponse(res, 'User not found.', 404, 'NOT_FOUND');
      return;
    }
    const image = req.query.size === 'thumbnail' ? user.avatarThumbnail : user.avatarImage;
    if (!image) {
      errorResponse(res, 'Avatar not found.', 404, 'AVATAR_NOT_FOUND');
      return;
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(image));
  }

  static async list(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    if (!UserPolicy.canListUsers(user)) {
      errorResponse(res, 'Access denied. Only HR Managers and Admins can view users.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        departmentId: true,
        isActive: true,
        createdAt: true,
        department: true,
        roles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sanitizedUsers = users.map((u) => ({
      ...u,
      roles: u.roles.map((r) => r.role.name),
    }));

    successResponse(res, sanitizedUsers, 200);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    const user = req.user!;

    if (!UserPolicy.canManageUsers(user)) {
      errorResponse(res, 'Access denied. Only Admins can create internal user accounts.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      errorResponse(res, 'Email already in use.', 409, 'EMAIL_EXISTS');
      return;
    }

    const passwordHash = await hashPassword(data.password);

    // Fetch role IDs
    const roles = await prisma.role.findMany({
      where: { name: { in: data.roles } },
    });

    const newUser = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        departmentId: data.departmentId,
        isActive: true,
        roles: {
          create: roles.map((r) => ({ roleId: r.id })),
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        departmentId: true,
        isActive: true,
        createdAt: true,
      },
    });

    await recordRequestAudit(req, AuditAction.USER_CREATED, 'user', newUser.id, {
      assignedRoles: data.roles,
    });

    successResponse(res, newUser, 201, 'User account created successfully.');
  }

  static async assignRoles(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { roles } = req.body;
    const user = req.user!;

    if (!UserPolicy.canAssignRoles(user)) {
      errorResponse(res, 'Access denied. Only Admins can modify user roles.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      errorResponse(res, 'User not found.', 404, 'NOT_FOUND');
      return;
    }

    const dbRoles = await prisma.role.findMany({
      where: { name: { in: roles } },
    });

    // Replace roles atomically
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: id } }),
      prisma.userRole.createMany({
        data: dbRoles.map((r) => ({ userId: id, roleId: r.id })),
      }),
    ]);

    await recordRequestAudit(req, AuditAction.ROLE_CHANGED, 'user', id, {
      newRoles: roles,
    });

    successResponse(res, { message: 'Roles updated successfully', roles }, 200);
  }

  static async disable(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    if (!UserPolicy.canDisableUser(user, id)) {
      errorResponse(
        res,
        'Access denied. Cannot disable user account or self.',
        403,
        'FORBIDDEN_ACTION'
      );
      return;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, email: true, isActive: true },
    });

    await recordRequestAudit(req, AuditAction.USER_DISABLED, 'user', id);

    successResponse(res, updated, 200, 'User account has been disabled.');
  }
}
