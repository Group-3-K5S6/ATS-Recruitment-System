import type { RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { errorResponse, successResponse } from '../../utils/response';

type PublicStatus =
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'INTERVIEW'
  | 'COMPLETED';

const labels: Record<PublicStatus, string> = {
  RECEIVED: 'Đã nhận',
  UNDER_REVIEW: 'Đang xem xét',
  INTERVIEW: 'Mời phỏng vấn',
  COMPLETED: 'Kết thúc',
};

export function mapPublicStatus(stage: string, applicationStatus: string) {
  const currentStage = stage.trim().toUpperCase();
  const currentStatus = applicationStatus.trim().toUpperCase();

  let status: PublicStatus;

  if (
    currentStatus !== 'ACTIVE' ||
    ['OFFER', 'HIRED', 'REJECTED', 'CLOSED', 'WITHDRAWN', 'COMPLETED']
      .includes(currentStage)
  ) {
    status = 'COMPLETED';
  } else if (['INTERVIEW', 'INTERVIEWING'].includes(currentStage)) {
    status = 'INTERVIEW';
  } else if (['SCREENING', 'UNDER_REVIEW'].includes(currentStage)) {
    status = 'UNDER_REVIEW';
  } else if (currentStage === 'APPLIED') {
    status = 'RECEIVED';
  } else {
    status = 'UNDER_REVIEW';
  }

  return { status, statusLabel: labels[status] };
}

const lookupSchema = z.object({
  trackingCode: z.string()
    .trim()
    .min(5)
    .max(100)
    .regex(/^ATS-[A-Za-z0-9_-]+$/i),
  email: z.string().trim().email().max(254),
});

const attempts = new Map<string, { count: number; expires: number }>();
const WINDOW = 60 * 1000;
const MAX = 30;

export const publicStatusLimiter: RequestHandler = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = attempts.get(ip);

  if (!entry || now >= entry.expires) {
    entry = { count: 0, expires: now + WINDOW };
  }

  entry.count++;
  attempts.set(ip, entry);

  if (entry.count > MAX) {
    res.setHeader('Retry-After', Math.ceil((entry.expires - now) / 1000));
    errorResponse(
      res,
      'Quá nhiều yêu cầu tra cứu. Vui lòng thử lại sau.',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
    return;
  }

  next();
};

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    if (now >= entry.expires) attempts.delete(ip);
  }
}, 60 * 1000);

cleanup.unref();

export const publicStatusHandler: RequestHandler = async (req, res) => {
  const input = lookupSchema.safeParse(req.body);

  if (!input.success) {
    errorResponse(
      res,
      'Mã tra cứu hoặc email không hợp lệ.',
      400,
      'VALIDATION_ERROR'
    );
    return;
  }

  const trackingCode = input.data.trackingCode.toUpperCase();
  const normalizedEmail = input.data.email.trim().toLowerCase();

  try {
    const application = await prisma.application.findUnique({
      where: { trackingCode },
      select: {
        stage: true,
        status: true,
        applicantEmailNormalized: true,
        candidate: { select: { email: true } },
      },
    });

    const savedEmail = (
      application?.applicantEmailNormalized ||
      application?.candidate.email ||
      ''
    ).trim().toLowerCase();

    if (!application || savedEmail !== normalizedEmail) {
      errorResponse(res, 'Không tìm thấy hồ sơ phù hợp.', 404, 'NOT_FOUND');
      return;
    }

    successResponse(res, {
      trackingCode,
      ...mapPublicStatus(application.stage, application.status),
    }, 200);
  } catch (error) {
    console.error('[S4-05] Tra cứu trạng thái thất bại');
    errorResponse(res, 'Không thể tra cứu hồ sơ lúc này.', 500, 'INTERNAL_SERVER_ERROR');
  }
};