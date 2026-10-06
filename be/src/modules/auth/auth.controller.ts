import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../database/prisma';
import { comparePassword, hashPassword } from '../../utils/password';

import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  revokeToken,
  isTokenRevoked,
  hashToken,
} from '../../utils/token';

import { sendResetPasswordEmail } from '../../utils/email';

import {
  successResponse,
  errorResponse,
} from '../../utils/response';

import {
  recordRequestAudit,
} from '../../middleware/audit-logger';

import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { PermissionCode } from '../../rbac/permissions';
import { MenuService } from '../menu/menu.service';


/* =========================================================
   VALIDATION
========================================================= */

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});


export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  phone: z.string().optional(),
});


export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});


export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(
      1,
      'Vui lòng nhập mật khẩu hiện tại.'
    ),

  newPassword: z
    .string()
    .min(
      8,
      'Mật khẩu mới phải tối thiểu 8 ký tự.'
    )
    .regex(
      /[A-Za-z]/,
      'Mật khẩu mới phải có ít nhất 1 chữ cái.'
    )
    .regex(
      /\d/,
      'Mật khẩu mới phải có ít nhất 1 chữ số.'
    ),
});


export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email(
      'Email không đúng định dạng.'
    ),
});


export const resetPasswordSchema = z.object({
  token: z
    .string()
    .min(
      1,
      'Token đặt lại mật khẩu không được để trống.'
    ),

  newPassword: z
    .string()
    .min(
      8,
      'Mật khẩu mới phải tối thiểu 8 ký tự.'
    )
    .regex(
      /[A-Z]/,
      'Mật khẩu mới phải có ít nhất 1 chữ hoa.'
    )
    .regex(
      /[a-z]/,
      'Mật khẩu mới phải có ít nhất 1 chữ thường.'
    )
    .regex(
      /\d/,
      'Mật khẩu mới phải có ít nhất 1 chữ số.'
    )
    .regex(
      /[^A-Za-z0-9]/,
      'Mật khẩu mới phải có ít nhất 1 ký tự đặc biệt.'
    ),
});


export class AuthController {

  /* =========================================================
     S1-01 - LOGIN
  ========================================================= */

  static async login(
    req: Request,
    res: Response
  ): Promise<void> {

    const email =
      String(
        req.body.email ?? ''
      )
        .trim()
        .toLowerCase();


    const password =
      String(
        req.body.password ?? ''
      );


    const rawDeviceId =
      String(
        req.body.deviceId ??
        req.header('x-device-id') ??
        ''
      ).trim();


    const deviceId =
      rawDeviceId ||
      `ip:${req.ip || 'unknown'}`;


    const now =
      new Date();


    let loginAttempt =
      await prisma
        .loginAttempt
        .findUnique({
          where: {
            email_deviceId: {
              email,
              deviceId,
            },
          },
        });


    let failedAttempts =
      loginAttempt?.failedAttempts ??
      0;


    let deviceLockedUntil =
      loginAttempt?.lockedUntil ??
      null;


    /* =====================================================
       THIẾT BỊ ĐANG BỊ KHÓA
    ===================================================== */

    if (
      deviceLockedUntil !== null &&
      deviceLockedUntil.getTime() >
        now.getTime()
    ) {

      errorResponse(
        res,
        'Thiết bị này đang tạm thời bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
        423,
        'DEVICE_TEMPORARILY_LOCKED'
      );

      return;
    }


    /* =====================================================
       HẾT THỜI GIAN KHÓA
    ===================================================== */

    if (
      deviceLockedUntil !== null &&
      deviceLockedUntil.getTime() <=
        now.getTime()
    ) {

      await prisma
        .loginAttempt
        .update({
          where: {
            email_deviceId: {
              email,
              deviceId,
            },
          },

          data: {
            failedAttempts: 0,
            lockedUntil: null,
          },
        });


      failedAttempts = 0;

      deviceLockedUntil = null;

      loginAttempt = null;
    }


    /* =====================================================
       TÌM USER
    ===================================================== */

    const user =
      await prisma
        .user
        .findUnique({

          where: {
            email,
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


    const isMatch =
      !!user &&
      user.isActive &&
      await comparePassword(
        password,
        user.passwordHash
      );


    /* =====================================================
       LOGIN SAI
    ===================================================== */

    if (!isMatch) {

      const nextFailedAttempts =
        failedAttempts + 1;


      if (
        nextFailedAttempts >= 5
      ) {

        const newLockedUntil =
          new Date(
            Date.now() +
            15 * 60 * 1000
          );


        await prisma
          .loginAttempt
          .upsert({

            where: {

              email_deviceId: {
                email,
                deviceId,
              },

            },


            update: {

              failedAttempts:
                nextFailedAttempts,

              lockedUntil:
                newLockedUntil,

            },


            create: {

              email,

              deviceId,

              failedAttempts:
                nextFailedAttempts,

              lockedUntil:
                newLockedUntil,

            },

          });


        errorResponse(
          res,
          'Thiết bị này tạm thời bị khóa do đăng nhập sai 5 lần liên tiếp. Vui lòng thử lại sau 15 phút.',
          423,
          'DEVICE_TEMPORARILY_LOCKED'
        );

        return;
      }


      await prisma
        .loginAttempt
        .upsert({

          where: {

            email_deviceId: {
              email,
              deviceId,
            },

          },


          update: {

            failedAttempts:
              nextFailedAttempts,

            lockedUntil:
              null,

          },


          create: {

            email,

            deviceId,

            failedAttempts:
              nextFailedAttempts,

          },

        });


      const remainingAttempts =
        5 -
        nextFailedAttempts;


      errorResponse(
        res,
        `Email hoặc mật khẩu không đúng. Bạn còn ${remainingAttempts} lần thử trước khi thiết bị tạm khóa 15 phút.`,
        401,
        'INVALID_CREDENTIALS'
      );

      return;
    }


    if (
      !user ||
      !user.isActive
    ) {

      errorResponse(
        res,
        'Email hoặc mật khẩu không đúng.',
        401,
        'INVALID_CREDENTIALS'
      );

      return;
    }


    /* =====================================================
       LOGIN ĐÚNG
    ===================================================== */

    await prisma
      .loginAttempt
      .deleteMany({

        where: {
          email,
          deviceId,
        },

      });


    /* =====================================================
       ROLE + PERMISSION
    ===================================================== */
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
   

    /* =====================================================
       TOKEN
    ===================================================== */

    const payload = {

      userId:
        user.id,

      email:
        user.email,

      tokenVersion:
        user.tokenVersion,

    };


    const accessToken =
      signAccessToken(
        payload
      );


    const refreshToken =
      signRefreshToken(
        payload
      );


    /* =====================================================
       AUDIT
    ===================================================== */

    await recordRequestAudit(
      req,
      AuditAction.LOGIN,
      'user',
      user.id,
      {
        email:
          user.email,
      }
    );


    /* =====================================================
       RESPONSE
    ===================================================== */

    successResponse(
      res,

      {
        accessToken,

        refreshToken,

        user: {

          id:
            user.id,

          email:
            user.email,

          fullName:
            user.fullName,

          departmentId:
            user.departmentId,

          roles,

          permissions:
            Array.from(
              permissionSet
            ),
        },

      },

      200,

      'Login successful'
    );

  }


  /* =========================================================
     REGISTER
  ========================================================= */

  static async register(
    req: Request,
    res: Response
  ): Promise<void> {

    const {
      email,
      password,
      fullName,
      phone,
    } = req.body;


    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();


    const existing =
      await prisma
        .user
        .findUnique({

          where: {
            email:
              normalizedEmail,
          },

        });


    if (existing) {

      errorResponse(
        res,
        'Email is already registered.',
        409,
        'EMAIL_EXISTS'
      );

      return;
    }


    const passwordHash =
      await hashPassword(
        password
      );


    const candidateRole =
      await prisma
        .role
        .findUnique({

          where: {
            name:
              RoleType.CANDIDATE,
          },

        });


    if (!candidateRole) {

      errorResponse(
        res,
        'Candidate role not configured.',
        500,
        'ROLE_MISSING'
      );

      return;
    }


    const newUser =
      await prisma
        .user
        .create({

          data: {

            email:
              normalizedEmail,

            passwordHash,

            fullName,

            isActive:
              true,


            roles: {

              create: {

                roleId:
                  candidateRole.id,

              },

            },


            candidateProfile: {

              create: {

                fullName,

                email:
                  normalizedEmail,

                phone:
                  phone ||
                  null,

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


    await recordRequestAudit(
      req,
      AuditAction.USER_CREATED,
      'user',
      newUser.id,
      {
        role:
          RoleType.CANDIDATE,
      }
    );


    successResponse(
      res,
      newUser,
      201,
      'Registration successful. Candidate profile created.'
    );

  }


  /* =========================================================
     S1-02 - LOGOUT
  ========================================================= */

  static async logout(
    req: Request,
    res: Response
  ): Promise<void> {

    const accessToken =
      req.token;


    const refreshToken =
      typeof req.body
        ?.refreshToken ===
      'string'

        ? req.body
            .refreshToken

        : null;


    if (accessToken) {

      await revokeToken(
        accessToken
      );

    }


    if (refreshToken) {

      const refreshPayload =
        verifyRefreshToken(
          refreshToken
        );


      if (refreshPayload) {

        await revokeToken(
          refreshToken
        );

      }

    }


    if (req.user) {

      await recordRequestAudit(
        req,
        AuditAction.LOGOUT,
        'user',
        req.user.id
      );

    }


    successResponse(
      res,

      {
        message:
          'Logged out successfully',
      },

      200
    );

  }


  /* =========================================================
     S1-02 - REFRESH TOKEN
  ========================================================= */

  static async refresh(
    req: Request,
    res: Response
  ): Promise<void> {

    const {
      refreshToken,
    } = req.body;


    const revoked =
      await isTokenRevoked(
        refreshToken
      );


    if (revoked) {

      errorResponse(
        res,
        'Refresh token has been revoked. Please log in again.',
        401,
        'TOKEN_REVOKED'
      );

      return;
    }


    const payload =
      verifyRefreshToken(
        refreshToken
      );


    if (!payload) {

      errorResponse(
        res,
        'Invalid or expired refresh token.',
        401,
        'INVALID_REFRESH_TOKEN'
      );

      return;
    }


    const user =
      await prisma
        .user
        .findUnique({

          where: {
            id:
              payload.userId,
          },


          select: {

            id: true,

            email: true,

            isActive: true,

            tokenVersion: true,

          },

        });


    if (
      !user ||
      !user.isActive
    ) {

      errorResponse(
        res,
        'Account is not available.',
        401,
        'ACCOUNT_DISABLED'
      );

      return;
    }


    const refreshTokenVersion =
      payload.tokenVersion ??
      0;


    if (
      refreshTokenVersion !==
      user.tokenVersion
    ) {

      errorResponse(
        res,
        'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.',
        401,
        'SESSION_INVALIDATED'
      );

      return;
    }


    const newAccessToken =
      signAccessToken({

        userId:
          user.id,

        email:
          user.email,

        tokenVersion:
          user.tokenVersion,

      });


    successResponse(
      res,

      {
        accessToken:
          newAccessToken,
      },

      200
    );

  }


  /* =========================================================
     S1-04 - CHANGE PASSWORD
  ========================================================= */

  static async changePassword(
    req: Request,
    res: Response
  ): Promise<void> {

    if (!req.user) {

      errorResponse(
        res,
        'Vui lòng đăng nhập trước khi đổi mật khẩu.',
        401,
        'UNAUTHORIZED'
      );

      return;
    }


    const {
      currentPassword,
      newPassword,
    } = req.body;


    /* =====================================================
       USER + 5 PASSWORD GẦN NHẤT
    ===================================================== */

    const user =
      await prisma
        .user
        .findUnique({

          where: {
            id:
              req.user.id,
          },


          include: {

            passwordHistories: {

              orderBy: {
                createdAt:
                  'desc',
              },

              take: 5,

            },

          },

        });


    if (
      !user ||
      !user.isActive
    ) {

      errorResponse(
        res,
        'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.',
        401,
        'ACCOUNT_DISABLED'
      );

      return;
    }


    /* =====================================================
       KIỂM TRA PASSWORD HIỆN TẠI
    ===================================================== */

    const currentPasswordCorrect =
      await comparePassword(

        currentPassword,

        user.passwordHash

      );


    if (!currentPasswordCorrect) {

      errorResponse(
        res,
        'Mật khẩu hiện tại không đúng.',
        400,
        'INVALID_CURRENT_PASSWORD'
      );

      return;
    }


    /* =====================================================
       KHÔNG CHO TRÙNG PASSWORD HIỆN TẠI
    ===================================================== */

    const sameAsCurrent =
      await comparePassword(

        newPassword,

        user.passwordHash

      );


    if (sameAsCurrent) {

      errorResponse(
        res,
        'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
        400,
        'PASSWORD_REUSED'
      );

      return;
    }


    /* =====================================================
       KHÔNG DÙNG LẠI 5 PASSWORD GẦN NHẤT
    ===================================================== */

    for (
      const history
      of user.passwordHistories
    ) {

      const reused =
        await comparePassword(

          newPassword,

          history.passwordHash

        );


      if (reused) {

        errorResponse(
          res,
          'Mật khẩu mới không được trùng với các mật khẩu đã sử dụng gần đây.',
          400,
          'PASSWORD_REUSED'
        );

        return;
      }

    }


    /* =====================================================
       HASH PASSWORD MỚI
    ===================================================== */

    const newPasswordHash =
      await hashPassword(
        newPassword
      );


    /* =====================================================
       UPDATE DATABASE
    ===================================================== */

    const transactionResult =
      await prisma
        .$transaction([


          prisma
            .passwordHistory
            .create({

              data: {

                userId:
                  user.id,

                passwordHash:
                  user.passwordHash,

              },

            }),


          prisma
            .user
            .update({

              where: {
                id:
                  user.id,
              },


              data: {

                passwordHash:
                  newPasswordHash,


                tokenVersion: {
                  increment: 1,
                },


                failedLoginAttempts:
                  0,


                lockedUntil:
                  null,

              },


              select: {

                id: true,

                email: true,

                tokenVersion:
                  true,

              },

            }),

        ]);


    const updatedUser =
      transactionResult[1];


    const newTokenPayload = {

      userId:
        updatedUser.id,

      email:
        updatedUser.email,

      tokenVersion:
        updatedUser
          .tokenVersion,

    };


    const accessToken =
      signAccessToken(
        newTokenPayload
      );


    const refreshToken =
      signRefreshToken(
        newTokenPayload
      );


    await recordRequestAudit(
      req,
      AuditAction.PASSWORD_CHANGED,
      'user',
      user.id,
      {
        email:
          user.email,
      }
    );


    successResponse(
      res,

      {

        message:
          'Đổi mật khẩu thành công.',

        accessToken,

        refreshToken,

      },

      200,

      'Password changed successfully.'
    );

  }


  /* =========================================================
     S1-03 - FORGOT PASSWORD
  ========================================================= */

  static async forgotPassword(
    req: Request,
    res: Response
  ): Promise<void> {

    const email =
      String(
        req.body.email ??
        ''
      )
        .trim()
        .toLowerCase();


    const user =
      await prisma
        .user
        .findUnique({

          where: {
            email,
          },

        });


    /* =====================================================
       EMAIL KHÔNG TỒN TẠI
    ===================================================== */

    if (!user) {

      errorResponse(
        res,
        'Email này không tồn tại trong hệ thống.',
        404,
        'EMAIL_NOT_FOUND'
      );

      return;
    }


    if (!user.isActive) {

      errorResponse(
        res,
        'Tài khoản này hiện không hoạt động.',
        403,
        'ACCOUNT_INACTIVE'
      );

      return;
    }


    /* =====================================================
       XÓA TOKEN RESET CŨ
    ===================================================== */

    await prisma
      .passwordResetToken
      .deleteMany({

        where: {

          email:
            user.email,

          usedAt:
            null,

        },

      });


    const rawToken =
      crypto
        .randomBytes(32)
        .toString('hex');


    const tokenHash =
      hashToken(
        rawToken
      );


    const expiresAt =
      new Date(

        Date.now() +
        30 * 60 * 1000

      );


    const createdToken =
      await prisma
        .passwordResetToken
        .create({

          data: {

            email:
              user.email,

            tokenHash,

            expiresAt,

          },

        });


    /* =====================================================
       GỬI EMAIL
    ===================================================== */

    try {

      await sendResetPasswordEmail(

        user.email,

        rawToken

      );


      await recordRequestAudit(
        req,
        AuditAction.PASSWORD_RESET_REQUESTED,
        'user',
        user.id,
        {
          email:
            user.email,
        }
      );


    } catch (error) {


      await prisma
        .passwordResetToken
        .delete({

          where: {
            id:
              createdToken.id,
          },

        })
        .catch(
          () =>
            undefined
        );


      console.error(
        '[S1-03] Không gửi được email reset:',
        error
      );


      errorResponse(
        res,
        'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại.',
        500,
        'RESET_EMAIL_FAILED'
      );

      return;
    }


    successResponse(
      res,

      {
        message:
          'Đã gửi liên kết đặt lại mật khẩu đến email của bạn. Liên kết có hiệu lực trong 30 phút.',
      },

      200,

      'Reset password email sent successfully.'
    );

  }


  /* =========================================================
     S1-03 - RESET PASSWORD
  ========================================================= */

  static async resetPassword(
    req: Request,
    res: Response
  ): Promise<void> {

    const {
      token,
      newPassword,
    } = req.body;


    const tokenHash =
      hashToken(
        token
      );


    const resetTokenRecord =
      await prisma
        .passwordResetToken
        .findUnique({

          where: {
            tokenHash,
          },

        });


    if (!resetTokenRecord) {

      errorResponse(
        res,
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
        400,
        'INVALID_TOKEN'
      );

      return;
    }


    /* =====================================================
       LINK ĐÃ DÙNG
    ===================================================== */

    if (
      resetTokenRecord
        .usedAt !==
      null
    ) {

      errorResponse(
        res,
        'Liên kết đặt lại mật khẩu này đã được sử dụng.',
        400,
        'TOKEN_ALREADY_USED'
      );

      return;
    }


    /* =====================================================
       LINK HẾT HẠN
    ===================================================== */

    if (
      resetTokenRecord
        .expiresAt <
      new Date()
    ) {

      errorResponse(
        res,
        'Liên kết đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu một liên kết mới.',
        400,
        'EXPIRED_TOKEN'
      );

      return;
    }


    /* =====================================================
       USER + PASSWORD HISTORY
    ===================================================== */

    const user =
      await prisma
        .user
        .findUnique({

          where: {

            email:
              resetTokenRecord
                .email,

          },


          include: {

            passwordHistories: {

              orderBy: {

                createdAt:
                  'desc',

              },

              take: 5,

            },

          },

        });


    if (
      !user ||
      !user.isActive
    ) {

      errorResponse(
        res,
        'Tài khoản không tồn tại hoặc đã bị khóa.',
        400,
        'USER_NOT_FOUND'
      );

      return;
    }


    /* =====================================================
       KHÔNG TRÙNG PASSWORD HIỆN TẠI
    ===================================================== */

    const sameAsCurrent =
      await comparePassword(

        newPassword,

        user.passwordHash

      );


    if (sameAsCurrent) {

      errorResponse(
        res,
        'Mật khẩu mới không được trùng với mật khẩu hiện tại.',
        400,
        'PASSWORD_REUSED'
      );

      return;
    }


    /* =====================================================
       KHÔNG DÙNG LẠI 5 PASSWORD GẦN NHẤT
    ===================================================== */

    for (
      const history
      of user.passwordHistories
    ) {

      const reused =
        await comparePassword(

          newPassword,

          history.passwordHash

        );


      if (reused) {

        errorResponse(
          res,
          'Mật khẩu mới không được trùng với các mật khẩu đã sử dụng gần đây.',
          400,
          'PASSWORD_REUSED'
        );

        return;
      }

    }


    const newPasswordHash =
      await hashPassword(
        newPassword
      );


    /* =====================================================
       UPDATE TRANSACTION
    ===================================================== */

    await prisma
      .$transaction([


        prisma
          .passwordResetToken
          .update({

            where: {

              id:
                resetTokenRecord.id,

            },

            data: {

              usedAt:
                new Date(),

            },

          }),


        prisma
          .passwordHistory
          .create({

            data: {

              userId:
                user.id,

              passwordHash:
                user.passwordHash,

            },

          }),


        prisma
          .user
          .update({

            where: {
              id:
                user.id,
            },


            data: {

              passwordHash:
                newPasswordHash,


              failedLoginAttempts:
                0,


              lockedUntil:
                null,


              tokenVersion: {
                increment: 1,
              },

            },

          }),

      ]);


    await recordRequestAudit(
      req,
      AuditAction.PASSWORD_RESET_COMPLETED,
      'user',
      user.id,
      {
        email:
          user.email,
      }
    );


    successResponse(
      res,

      {

        message:
          'Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới.',

      },

      200,

      'Password reset successfully.'
    );

  }


  /* =========================================================
     CURRENT USER
  ========================================================= */

  static async me(
    req: Request,
    res: Response
  ): Promise<void> {

    if (!req.user) {

      errorResponse(
        res,
        'Not authenticated',
        401,
        'UNAUTHORIZED'
      );

      return;
    }


    successResponse(
      res,
      req.user,
      200
    );

  }


  /* =========================================================
     MENU
  ========================================================= */

  static async menu(
    req: Request,
    res: Response
  ): Promise<void> {

    if (!req.user) {

      errorResponse(
        res,
        'Authentication required before accessing menu.',
        401,
        'UNAUTHORIZED'
      );

      return;
    }


    const menu =
      MenuService
        .getMenuForUser(
          req.user
        );


    successResponse(
      res,
      menu,
      200,
      'User navigation menu retrieved successfully'
    );

  }

}