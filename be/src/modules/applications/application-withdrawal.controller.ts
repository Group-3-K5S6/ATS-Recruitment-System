import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { sendApplicationWithdrawalConfirmationEmail, sendApplicationWithdrawalNoticeEmail } from '../../utils/email';
import { errorResponse, successResponse } from '../../utils/response';

const TOKEN_TTL_MS = 30 * 60 * 1000;
const requestSchema = z.object({
  trackingCode: z.string().trim().min(5).max(100).regex(/^ATS-[A-Za-z0-9_-]+$/i),
  email: z.string().trim().email().max(254),
});
const tokenSchema = z.object({ token: z.string().min(32).max(256) });
const neutralResponse = 'Nếu hồ sơ còn hoạt động và thông tin khớp, liên kết xác nhận sẽ được gửi đến email đã đăng ký.';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
function invalidToken(res: Response): void {
  errorResponse(res, 'Liên kết không hợp lệ, đã hết hạn hoặc đã được sử dụng.', 400, 'INVALID_WITHDRAWAL_TOKEN');
}

export class ApplicationWithdrawalController {
  static async request(req: Request, res: Response): Promise<void> {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      errorResponse(res, 'Mã tra cứu hoặc email không hợp lệ.', 400, 'VALIDATION_ERROR');
      return;
    }

    const trackingCode = parsed.data.trackingCode.toUpperCase();
    const email = parsed.data.email.trim().toLowerCase();
    const application = await prisma.application.findUnique({
      where: { trackingCode },
      include: { candidate: true, job: true },
    });

    const savedEmail = (application?.applicantEmailNormalized || application?.candidate.email || '')
      .trim().toLowerCase();

    if (application && application.status === 'ACTIVE' && savedEmail === email) {
      const rawToken = randomBytes(32).toString('hex');
      const row = await prisma.applicationWithdrawalToken.create({
        data: {
          applicationId: application.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });

      try {
        await sendApplicationWithdrawalConfirmationEmail(
          savedEmail, application.candidate.fullName, application.job.title, rawToken
        );
      } catch (err) {
        // Trả lời trung lập để không tiết lộ mã hồ sơ/email có tồn tại hay không.
        await prisma.applicationWithdrawalToken.deleteMany({ where: { id: row.id } });
        console.error('[S4-06] Không gửi được liên kết xác nhận:', err);
        successResponse(res, null, 202, neutralResponse);
        return;
      }
      try {
        await prisma.auditLog.create({ data: {
          action: 'APPLICATION_WITHDRAWAL_REQUESTED', resourceType: 'application', resourceId: application.id,
        } });
      } catch (err) {
        console.error('[S4-06] Không ghi được audit yêu cầu rút:', err);
      }
    }

    successResponse(res, null, 202, neutralResponse);
  }

  static async preview(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const parsed = tokenSchema.safeParse(req.query);
    if (!parsed.success) return invalidToken(res);

    const token = await prisma.applicationWithdrawalToken.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      include: { application: { include: { candidate: true, job: true } } },
    });
    if (!token || token.usedAt || token.expiresAt <= new Date() || token.application.status !== 'ACTIVE') {
      return invalidToken(res);
    }

    successResponse(res, {
      candidateName: token.application.candidate.fullName,
      jobTitle: token.application.job.title,
      requiresConfirmation: true,
      expiresAt: token.expiresAt,
    });
  }

  static async confirm(req: Request, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    const parsed = tokenSchema.safeParse(req.body);
    if (!parsed.success) return invalidToken(res);

    let result: {
      id: string;
      candidateName: string;
      jobTitle: string;
      recruiterId: string | null;
    } | null;

    try {
      result = await prisma.$transaction(async (tx) => {
        const token = await tx.applicationWithdrawalToken.findUnique({
          where: { tokenHash: hashToken(parsed.data.token) },
          include: { application: { include: { candidate: true, job: true } } },
        });
        if (!token || token.usedAt || token.expiresAt <= new Date() || token.application.status !== 'ACTIVE') {
          return null;
        }

        const changed = await tx.application.updateMany({
          where: { id: token.applicationId, status: 'ACTIVE' },
          data: { status: 'WITHDRAWN', stage: 'WITHDRAWN' },
        });
        if (changed.count !== 1) return null;

        const consumed = await tx.applicationWithdrawalToken.updateMany({
          where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) {
          // Throw để rollback thay đổi status của hồ sơ.
          throw new Error('TOKEN_CONCURRENTLY_CONSUMED');
        }

        await tx.auditLog.create({ data: {
          action: 'APPLICATION_WITHDRAWN', resourceType: 'application', resourceId: token.applicationId,
          metadata: JSON.stringify({ from: 'ACTIVE', to: 'WITHDRAWN' }),
        } });

        return {
          id: token.application.id,
          candidateName: token.application.candidate.fullName,
          jobTitle: token.application.job.title,
          recruiterId: token.application.assignedRecruiterId || token.application.job.recruiterId,
        };
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'TOKEN_CONCURRENTLY_CONSUMED') {
        return invalidToken(res);
      }
      throw err;
    }

    if (!result) return invalidToken(res);

    if (result.recruiterId) {
      const recruiter = await prisma.user.findUnique({
        where: { id: result.recruiterId }, select: { email: true, fullName: true },
      });
      if (recruiter) {
        try {
          await sendApplicationWithdrawalNoticeEmail(
            recruiter.email, recruiter.fullName, result.candidateName, result.jobTitle
          );
        } catch (err) {
          // Đã rút trong transaction: không hoàn tác khi lỗi email thông báo.
          console.error('[S4-06] Không gửi được email thông báo Recruiter:', err);
        }
      }
    }

    successResponse(res, { applicationId: result.id, status: 'WITHDRAWN' }, 200, 'Hồ sơ đã được rút.');
  }
}
