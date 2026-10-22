import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

const messages = vi.hoisted(() => ({
  token: '',
  recipients: [] as string[],
}));

vi.mock('../src/utils/email', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/utils/email')>();

  return {
    ...original,
    sendApplicationWithdrawalConfirmationEmail: vi.fn(
      async (_to: string, _name: string, _job: string, token: string) => {
        messages.token = token;
      }
    ),
    sendApplicationWithdrawalNoticeEmail: vi.fn(
      async (to: string) => {
        messages.recipients.push(to);
      }
    ),
  };
});

import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('S4-06 - Thông báo Recruiter phụ trách', () => {
  it('Gửi thông báo khi ứng viên rút hồ sơ được phân công', async () => {
    const recruiter = await prisma.user.findFirst({
      where: {
        isActive: true,
        roles: { some: { role: { name: 'RECRUITER' } } },
      },
      select: { id: true, email: true },
    });

    if (!recruiter) {
      throw new Error('SQLITE_TEST_CHUA_CO_RECRUITER_HOP_LE');
    }

    const job = await prisma.job.findFirst({
      select: { id: true },
    });

    if (!job) {
      throw new Error('SQLITE_TEST_CHUA_CO_JOB');
    }

    const email = `s406-${randomUUID()}@example.com`;
    const trackingCode =
      `ATS-S406-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    let candidateId = '';
    let applicationId = '';

    try {
      const candidate = await prisma.candidate.create({
        data: {
          fullName: 'Ung vien kiem thu S4-06',
          email,
        },
      });

      candidateId = candidate.id;

      const application = await prisma.application.create({
        data: {
          candidateId,
          jobId: job.id,
          trackingCode,
          applicantEmailNormalized: email,
          assignedRecruiterId: recruiter.id,
          stage: 'APPLIED',
          status: 'ACTIVE',
        },
      });

      applicationId = application.id;

      const requested = await request(app)
        .post('/api/applications/withdrawal-requests')
        .send({ trackingCode, email });

      expect(requested.status).toBe(202);
      expect(messages.token).toBeTruthy();

      const confirmed = await request(app)
        .post('/api/applications/withdrawal-confirmation')
        .send({ token: messages.token });

      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data.status).toBe('WITHDRAWN');

      expect(messages.recipients).toContain(recruiter.email);

      const saved = await prisma.application.findUnique({
        where: { id: applicationId },
      });

      expect(saved?.status).toBe('WITHDRAWN');
      expect(saved?.stage).toBe('WITHDRAWN');

      console.log('S406_RECRUITER_NOTICE_MOCK_PASS');
    } finally {
      if (applicationId) {
        await prisma.applicationWithdrawalToken.deleteMany({
          where: { applicationId },
        });

        await prisma.auditLog.deleteMany({
          where: {
            resourceType: 'application',
            resourceId: applicationId,
          },
        });

        await prisma.application.delete({
          where: { id: applicationId },
        });
      }

      if (candidateId) {
        await prisma.candidate.delete({
          where: { id: candidateId },
        });
      }
    }
  });
});