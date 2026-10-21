import { createHash, randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { logAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { sendApplicationWithdrawalConfirmationEmail, sendApplicationWithdrawalNoticeEmail } from '../../utils/email';
import { errorResponse, successResponse } from '../../utils/response';

const TOKEN_TTL_MS = 30 * 60 * 1000;
const requestSchema = z.object({ applicationId: z.string().min(1), email: z.string().email().max(320) });
const tokenSchema = z.object({ token: z.string().min(32).max(256) });

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function invalidToken(res: Response): void {
  errorResponse(res, 'Liên kết không hợp lệ, đã hết hạn hoặc đã được sử dụng.', 400, 'INVALID_WITHDRAWAL_TOKEN');
}

export class ApplicationWithdrawalController {
  static async request(req: Request, res: Response): Promise<void> {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      errorResponse(res, 'applicationId và email hợp lệ là bắt buộc.', 400, 'VALIDATION_ERROR');
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const application = await prisma.application.findFirst({
      where: { id: parsed.data.applicationId, status: 'ACTIVE' },
      include: { candidate: true, job: true },
    });

    // Same response for a mismatch, missing application, or inactive application prevents enumeration.
    if (application && application.candidate.email.trim().toLowerCase() === email) {
      const rawToken = randomBytes(32).toString('base64url');
      const savedToken = await prisma.applicationWithdrawalToken.create({
        data: { applicationId: application.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      });
      try {
        await sendApplicationWithdrawalConfirmationEmail(application.candidate.email, application.candidate.fullName, application.job.title, rawToken);
      } catch (error) {
        await prisma.applicationWithdrawalToken.delete({ where: { id: savedToken.id } });
        console.error('Failed to send application withdrawal confirmation email:', error);
        errorResponse(res, 'Không gửi được email xác nhận. Vui lòng kiểm tra cấu hình SMTP và thử lại.', 503, 'EMAIL_DELIVERY_FAILED');
        return;
      }
      await logAudit({ action: AuditAction.APPLICATION_WITHDRAWAL_REQUESTED, resourceType: 'application', resourceId: application.id });
    }

    successResponse(res, null, 202, 'Nếu hồ sơ đang hoạt động và email khớp, email xác nhận sẽ được gửi.');
  }

  static async preview(req: Request, res: Response): Promise<void> {
    const parsed = tokenSchema.safeParse(req.query);
    if (!parsed.success) return invalidToken(res);

    const token = await prisma.applicationWithdrawalToken.findUnique({
      where: { tokenHash: hashToken(parsed.data.token) },
      include: { application: { include: { candidate: true, job: true } } },
    });
    if (!token || token.usedAt || token.expiresAt <= new Date() || token.application.status !== 'ACTIVE') return invalidToken(res);

    successResponse(res, {
      candidateName: token.application.candidate.fullName,
      jobTitle: token.application.job.title,
      expiresAt: token.expiresAt,
      requiresConfirmation: true,
    });
  }

  static async confirm(req: Request, res: Response): Promise<void> {
    const parsed = tokenSchema.safeParse(req.body);
    if (!parsed.success) return invalidToken(res);

    const result = await prisma.$transaction(async (tx) => {
      const token = await tx.applicationWithdrawalToken.findUnique({
        where: { tokenHash: hashToken(parsed.data.token) },
        include: { application: { include: { candidate: true, job: { include: { recruiter: true } } } } },
      });
      if (!token || token.usedAt || token.expiresAt <= new Date() || token.application.status !== 'ACTIVE') return null;

      const consumed = await tx.applicationWithdrawalToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) return null;

      const withdrawn = await tx.application.updateMany({
        where: { id: token.applicationId, status: 'ACTIVE' },
        data: { status: 'WITHDRAWN' },
      });
      if (withdrawn.count !== 1) return null;
      return token.application;
    });

    if (!result) return invalidToken(res);

    await logAudit({
      action: AuditAction.APPLICATION_WITHDRAWN, resourceType: 'application', resourceId: result.id,
      metadata: { previousStatus: 'ACTIVE', status: 'WITHDRAWN' },
    });

    const recruiter = result.assignedRecruiterId
      ? await prisma.user.findUnique({ where: { id: result.assignedRecruiterId }, select: { email: true, fullName: true } })
      : result.job.recruiter;
    if (recruiter) {
      try {
        await sendApplicationWithdrawalNoticeEmail(recruiter.email, recruiter.fullName, result.candidate.fullName, result.job.title);
      } catch (error) {
        // Withdrawal is committed; keep an email failure visible in server logs without undoing it.
        console.error('Failed to send application withdrawal notice:', error);
      }
    }

    successResponse(res, { applicationId: result.id, status: 'WITHDRAWN' }, 200, 'Hồ sơ ứng tuyển đã được rút.');
  }
}
