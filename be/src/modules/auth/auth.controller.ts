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

import {
  sendResetPasswordEmail,
  sendEmployeeActivationEmail,
} from '../../utils/email';

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

  // S1-01
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

/* =========================================================
   S1-04 - CHANGE PASSWORD
========================================================= */

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

/* =========================================================
   S1-03 - FORGOT / RESET PASSWORD
========================================================= */

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Email không đúng định dạng.'),
});


export const resetPasswordSchema = z.object({
  token: z
    .string()
    .regex(/^\d{6}$/, 'Mã OTP phải gồm 6 chữ số.'),

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

export const activateAccountSchema = z.object({ token: z.string().min(32).max(128) });


export class AuthController {

  /* =========================================================
     S1-01 - LOGIN
  ========================================================= */

  static async login(
    req: Request,
    res: Response
  ): Promise<void> {

    const email = String(req.body.email)
      .trim()
      .toLowerCase();

    const password =
      String(req.body.password);

    const now =
      new Date();


    const user =
      await prisma.user.findUnique({
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


    /* =====================================================
       EMAIL KHÔNG TỒN TẠI / USER KHÔNG HOẠT ĐỘNG
    ===================================================== */

    if (!user || !user.isActive) {
      if (user?.activationTokenHash) {
        errorResponse(res, 'Tài khoản chưa được kích hoạt. Hãy kiểm tra email kích hoạt.', 403, 'ACCOUNT_NOT_ACTIVATED');
        return;
      }
      errorResponse(
        res,
        'Email hoặc mật khẩu không đúng.',
        401,
        'INVALID_CREDENTIALS'
      );

      return;
    }


    let failedLoginAttempts =
      user.failedLoginAttempts;

    let lockedUntil =
      user.lockedUntil;


    /* =====================================================
       TÀI KHOẢN ĐANG BỊ KHÓA
    ===================================================== */

    if (
      lockedUntil !== null &&
      lockedUntil.getTime() > now.getTime()
    ) {
      errorResponse(
        res,
        'Tài khoản tạm thời bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
        423,
        'ACCOUNT_TEMPORARILY_LOCKED'
      );

      return;
    }


    /* =====================================================
       ĐÃ HẾT THỜI GIAN KHÓA
    ===================================================== */

    if (
      lockedUntil !== null &&
      lockedUntil.getTime() <= now.getTime()
    ) {
      await prisma.user.update({
        where: {
          id: user.id,
        },

        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      failedLoginAttempts = 0;
      lockedUntil = null;
    }


    /* =====================================================
       KIỂM TRA PASSWORD
    ===================================================== */

    const isMatch =
      await comparePassword(
        password,
        user.passwordHash
      );


    /* =====================================================
       PASSWORD SAI
    ===================================================== */

    if (!isMatch) {

      const nextFailedAttempts =
        failedLoginAttempts + 1;


      /*
       * Sai lần thứ 5 trở lên:
       * khóa tài khoản trong 15 phút.
       */

      if (nextFailedAttempts >= 5) {

        const newLockedUntil =
          new Date(
            Date.now() +
            15 * 60 * 1000
          );


        await prisma.user.update({
          where: {
            id: user.id,
          },

          data: {
            failedLoginAttempts:
              nextFailedAttempts,

            lockedUntil:
              newLockedUntil,
          },
        });


        errorResponse(
          res,
          'Tài khoản tạm thời bị khóa do đăng nhập sai 5 lần liên tiếp. Vui lòng thử lại sau 15 phút.',
          423,
          'ACCOUNT_TEMPORARILY_LOCKED'
        );

        return;
      }


      /*
       * Sai lần 1 - 4.
       */

      await prisma.user.update({
        where: {
          id: user.id,
        },

        data: {
          failedLoginAttempts:
            nextFailedAttempts,
        },
      });


      errorResponse(
        res,
        'Email hoặc mật khẩu không đúng.',
        401,
        'INVALID_CREDENTIALS'
      );

      return;
    }


    /* =====================================================
       LOGIN ĐÚNG → RESET BỘ ĐẾM
    ===================================================== */

    if (
      failedLoginAttempts > 0 ||
      lockedUntil !== null
    ) {
      await prisma.user.update({
        where: {
          id: user.id,
        },

        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }


    /* =====================================================
       ROLE + PERMISSION
    ===================================================== */

    const roles: RoleType[] = [];

    const permissionSet =
      new Set<PermissionCode>();


    for (const userRole of user.roles) {

      roles.push(
        userRole.role.name as RoleType
      );


      for (
        const rolePermission
        of userRole.role.permissions
      ) {
        permissionSet.add(
          rolePermission.permission.code as PermissionCode
        );
      }
    }


    /* =====================================================
       TOKEN
    ===================================================== */

    const payload = {
      userId: user.id,
      email: user.email,

      // S1-04
      tokenVersion: user.tokenVersion,
    };


    const accessToken =
      signAccessToken(payload);


    const refreshToken =
      signRefreshToken(payload);


    /* =====================================================
       AUDIT
    ===================================================== */

    await recordRequestAudit(
      req,
      AuditAction.LOGIN,
      'user',
      user.id,
      {
        email: user.email,
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
            Array.from(permissionSet),
          mustChangePassword: user.mustChangePassword,
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
      await prisma.user.findUnique({
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
      await prisma.role.findUnique({
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
      await prisma.user.create({
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
                phone || null,
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
      typeof req.body?.refreshToken ===
      'string'
        ? req.body.refreshToken
        : null;


    /*
     * Thu hồi Access Token.
     */

    if (accessToken) {
      await revokeToken(
        accessToken
      );
    }


    /*
     * Thu hồi Refresh Token.
     */

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


    /* =====================================================
       REFRESH TOKEN ĐÃ BỊ REVOKE?
    ===================================================== */

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


    /* =====================================================
       XÁC MINH REFRESH TOKEN
    ===================================================== */

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


    /* =====================================================
       KIỂM TRA USER
    ===================================================== */

    const user =
      await prisma.user.findUnique({
        where: {
          id:
            payload.userId,
        },

        select: {
          id: true,
          email: true,
          isActive: true,
          lockedUntil: true,

          // S1-04
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


    /*
     * Không cấp access token mới
     * khi tài khoản đang bị khóa tạm.
     */

    if (
      user.lockedUntil !== null &&
      user.lockedUntil.getTime() >
      Date.now()
    ) {
      errorResponse(
        res,
        'Tài khoản đang tạm thời bị khóa.',
        423,
        'ACCOUNT_TEMPORARILY_LOCKED'
      );

      return;
    }


    /* =====================================================
       S1-04 - KIỂM TRA VERSION CỦA REFRESH TOKEN
    ===================================================== */

    const refreshTokenVersion =
      payload.tokenVersion ?? 0;


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
     S1-03 - FORGOT PASSWORD
  ========================================================= */

  /* =========================================================
     S1-04 - CHANGE PASSWORD
  ========================================================= */

  static async changePassword(
    req: Request,
    res: Response
  ): Promise<void> {

    /* =====================================================
       1. KIỂM TRA ĐÃ ĐĂNG NHẬP
    ===================================================== */

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
       2. LẤY USER HIỆN TẠI
    ===================================================== */

    const user =
      await prisma.user.findUnique({
        where: {
          id: req.user.id,
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
       3. KIỂM TRA MẬT KHẨU HIỆN TẠI
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
       4. HASH MẬT KHẨU MỚI
    ===================================================== */

    const newPasswordHash =
      await hashPassword(
        newPassword
      );


    /* =====================================================
       5. ĐỔI MẬT KHẨU + TĂNG TOKEN VERSION

       tokenVersion tăng 1 sẽ làm toàn bộ access/refresh
       token cũ không còn hợp lệ.
    ===================================================== */

    const transactionResult =
      await prisma.$transaction([

        /*
         * Lưu mật khẩu cũ vào lịch sử.
         */

        prisma.passwordHistory.create({
          data: {
            userId:
              user.id,

            passwordHash:
              user.passwordHash,
          },
        }),


        /*
         * Đổi mật khẩu.
         * Tăng tokenVersion để vô hiệu hóa phiên cũ.
         */

        prisma.user.update({
          where: {
            id:
              user.id,
          },

          data: {
            passwordHash:
              newPasswordHash,

            mustChangePassword: false,

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
            tokenVersion: true,
          },
        }),

      ]);


    const updatedUser =
      transactionResult[1];


    /* =====================================================
       6. TẠO TOKEN MỚI CHO PHIÊN HIỆN TẠI

       Phiên khác:
       tokenVersion cũ → bị từ chối.

       Phiên hiện tại:
       nhận tokenVersion mới → tiếp tục sử dụng.
    ===================================================== */

    const newTokenPayload = {
      userId:
        updatedUser.id,

      email:
        updatedUser.email,

      tokenVersion:
        updatedUser.tokenVersion,
    };


    const accessToken =
      signAccessToken(
        newTokenPayload
      );


    const refreshToken =
      signRefreshToken(
        newTokenPayload
      );


    /* =====================================================
       7. AUDIT LOG
    ===================================================== */

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


    /* =====================================================
       8. RESPONSE
    ===================================================== */

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

  static async forgotPassword(
    req: Request,
    res: Response
  ): Promise<void> {

    const email =
      String(req.body.email)
        .trim()
        .toLowerCase();


    /*
     * Email tồn tại và không tồn tại
     * đều phải nhận cùng thông báo.
     */

    const genericMessage =
      'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi mã OTP đặt lại mật khẩu. Mã có hiệu lực trong 10 phút.';


    const user =
      await prisma.user.findUnique({
        where: {
          email,
        },
      });


    if (
      user &&
      user.isActive
    ) {

      /*
       * Hủy các link reset cũ
       * chưa được sử dụng.
       */

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


      /*
       * Sinh token ngẫu nhiên.
       */

      const rawToken = crypto.randomInt(100000, 1000000).toString();


      /*
       * Không lưu token gốc.
       * Chỉ lưu hash trong database.
       */

      const tokenHash =
        hashToken(
          rawToken
        );


      /*
       * OTP hết hạn sau 10 phút.
       */

      const expiresAt =
        new Date(
          Date.now() +
          10 * 60 * 1000
        );


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
        await prisma.passwordResetToken.deleteMany({
          where: { email: user.email, tokenHash, usedAt: null },
        });
        const errorCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'UNKNOWN';
        console.error(`[AUTH_EMAIL] Password reset email delivery failed (${errorCode}).`);
        errorResponse(
          res,
          'Không gửi được email OTP. Hệ thống email chưa được cấu hình hoặc đang gặp sự cố. Vui lòng liên hệ quản trị viên.',
          503,
          'EMAIL_DELIVERY_FAILED'
        );
        return;
      }
    }


    successResponse(
      res,
      {
        message:
          genericMessage,
      },
      200,
      genericMessage
    );
  }

  static async activateAccount(req: Request, res: Response): Promise<void> {
    const tokenHash = hashToken(String(req.body.token));
    const user = await prisma.user.findFirst({ where: { activationTokenHash: tokenHash } });
    if (!user || !user.activationExpiresAt || user.activationExpiresAt <= new Date()) {
      errorResponse(res, 'Mã kích hoạt không hợp lệ hoặc đã hết hạn.', 400, 'INVALID_ACTIVATION_TOKEN');
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true, activationTokenHash: null, activationExpiresAt: null } });
    successResponse(res, { message: 'Kích hoạt tài khoản thành công. Hãy đăng nhập bằng mật khẩu tạm và đổi mật khẩu.' }, 200);
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


    /* =====================================================
       HASH TOKEN TỪ LINK
    ===================================================== */

    const tokenHash =
      hashToken(
        token
      );


    /* =====================================================
       TÌM RESET TOKEN
    ===================================================== */

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
      resetTokenRecord.usedAt !==
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
      resetTokenRecord.expiresAt <
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
       TÌM USER + LỊCH SỬ PASSWORD
    ===================================================== */

    const user =
      await prisma.user.findUnique({
        where: {
          email:
            resetTokenRecord.email,
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
       KHÔNG CHO DÙNG LẠI PASSWORD HIỆN TẠI
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
       UPDATE TRONG TRANSACTION
    ===================================================== */

    await prisma.$transaction([

      /*
       * Đánh dấu reset link đã sử dụng.
       */

      prisma.passwordResetToken.update({
        where: {
          id:
            resetTokenRecord.id,
        },

        data: {
          usedAt:
            new Date(),
        },
      }),


      /*
       * Lưu password hiện tại vào lịch sử.
       */

      prisma.passwordHistory.create({
        data: {
          userId:
            user.id,

          passwordHash:
            user.passwordHash,
        },
      }),


      /*
       * Cập nhật password mới.
       * Đồng thời reset lockout của S1-01.
       */

      prisma.user.update({
        where: {
          id:
            user.id,
        },

        data: {
          passwordHash:
            newPasswordHash,

          mustChangePassword: false,
          tokenVersion: { increment: 1 },

          failedLoginAttempts:
            0,

          lockedUntil:
            null,
        },
      }),

    ]);


    /* =====================================================
       AUDIT
    ===================================================== */

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


    /* =====================================================
       RESPONSE
    ===================================================== */

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
      MenuService.getMenuForUser(
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
