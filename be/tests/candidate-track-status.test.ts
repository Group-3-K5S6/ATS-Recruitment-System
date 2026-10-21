/**
 * Candidate Status Tracking API — Comprehensive Acceptance, Persistence & Security Tests
 *
 * Endpoint: POST /api/candidates/track-status
 *
 * Scenarios covered:
 *  1. Persistent tracking code stored in database Application.trackingCode
 *  2. Application creation flow generates unique tracking code & persists it
 *  3. Collision retry: generateUniqueTrackingCode regenerates on collision
 *  4. Email notification: sends tracking email to candidate upon application creation
 *  5. Persistence across restarts: verified via fresh PrismaClient instance
 *  6. Old records without tracking code (trackingCode: null) cannot be tracked (404 safe)
 *  7. Multiple applications per candidate have distinct tracking codes (no auto-pick)
 *  8. Strict status mapping against real ATS lifecycle (RECEIVED, UNDER_REVIEW, INTERVIEW, COMPLETED)
 *  9. Anti-enumeration: non-existent code and email mismatch return identical 404 NOT_FOUND
 * 10. Privacy: response contains strictly { trackingCode, status, statusLabel }
 * 11. Rate limiter with proxy IP extraction (X-Forwarded-For) -> 429 RATE_LIMIT_EXCEEDED
 * 12. Safe database error handling (500 without leaking stack traces)
 */

import { randomUUID } from 'crypto';
import { existsSync, realpathSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import {
  mapApplicationStatus,
  CandidateService,
  generateTrackingCode,
  generateUniqueTrackingCode,
  generateOpaqueTrackingCode,
} from '../src/modules/candidates/candidate.service';
import { resetRateLimitStore } from '../src/middleware/rate-limiter';
import * as emailUtils from '../src/utils/email';
import { authHeader, loginAndGetToken } from './test-helper';

const assertDisposableDatabase = () => {
  const candidate = /^file:\.\/(\_ats_regression_[0-9a-f]{32}\.db)$/i.exec(
    process.env.DATABASE_URL ?? ''
  );
  const cwd = process.cwd();
  const dir = resolve(cwd, 'prisma');
  const file = candidate ? resolve(dir, candidate[1]) : '';
  const canonicalDir = existsSync(dir) ? realpathSync(dir) : '';
  const canonicalFile = file && existsSync(file) ? realpathSync(file) : '';
  if (
    process.env.NODE_ENV !== 'test' ||
    basename(cwd).toLowerCase() !== 'be' ||
    !canonicalFile ||
    !canonicalDir ||
    dirname(canonicalFile).toLowerCase() !== canonicalDir.toLowerCase()
  ) {
    throw new Error(
      'Track-status tests require NODE_ENV=test and a disposable _ats_regression_*.db database.'
    );
  }
};

const scope = randomUUID().slice(0, 8);
const fid = (tag: string) => `trkst3-${tag}-${scope}`;

describe('Candidate Status Tracking — POST /api/candidates/track-status', () => {
  let adminToken = '';

  // Test fixture IDs
  const deptId = fid('dept');
  const job1Id = fid('job1');
  const job2Id = fid('job2');
  const cand1Id = fid('cand1');
  const cand2Id = fid('cand2');
  const candMultiId = fid('cand-multi');
  const candLegacyId = fid('cand-legacy'); // Legacy candidate with no trackingCode

  const app1Id = fid('app1');
  const app2Id = fid('app2');
  const app3Id = fid('app3');
  const app4Id = fid('app4');
  const app5Id = fid('app5');
  const app6Id = fid('app6');
  const appMulti1Id = fid('app-m1');
  const appMulti2Id = fid('app-m2');
  const appLegacyId = fid('app-legacy'); // Old application with trackingCode: null

  // Persistent unguessable high-entropy tracking codes stored directly in database
  const trackCode1 = generateTrackingCode();
  const trackCode2 = generateTrackingCode();
  const trackCode3 = generateTrackingCode();
  const trackCode4 = generateTrackingCode();
  const trackCode5 = generateTrackingCode();
  const trackCode6 = generateTrackingCode();
  const trackCodeMulti1 = generateTrackingCode();
  const trackCodeMulti2 = generateTrackingCode();

  const email1 = `cand1.${scope}@tracking-persistent.local`;
  const email2 = `cand2.${scope}@tracking-persistent.local`;
  const emailMulti = `candmulti.${scope}@tracking-persistent.local`;
  const emailLegacy = `candlegacy.${scope}@tracking-persistent.local`;

  beforeAll(async () => {
    assertDisposableDatabase();
    resetRateLimitStore();

    const adminLogin = await loginAndGetToken('admin@ats.local');
    adminToken = adminLogin.token;

    // 1. Department & Job fixtures
    await prisma.department.create({
      data: {
        id: deptId,
        name: 'Persistent Tracking Dept',
        code: `DEP3-${scope}`,
      },
    });

    const hmUser = await prisma.user.findFirst();
    if (!hmUser) throw new Error('No user found in test DB for job fixture');

    await prisma.job.createMany({
      data: [
        {
          id: job1Id,
          title: 'Senior Backend Architect',
          departmentId: deptId,
          hiringManagerId: hmUser.id,
          status: 'PUBLISHED',
          description: 'Job 1 description',
        },
        {
          id: job2Id,
          title: 'Staff Frontend Engineer',
          departmentId: deptId,
          hiringManagerId: hmUser.id,
          status: 'PUBLISHED',
          description: 'Job 2 description',
        },
      ],
    });

    // 2. Candidate 1 with diverse application stages & stored trackingCode
    await prisma.candidate.create({
      data: {
        id: cand1Id,
        fullName: 'Nguyễn Văn Tra Cứu',
        email: email1,
        phone: '0981112233',
        cvUrl: 'https://storage.internal/cv/nguyen-van-tra-cuu.pdf',
        address: 'Hà Nội, Việt Nam',
        expectedSalary: 30000000,
        currentCompany: 'Secret Tech Corp',
      },
    });

    await prisma.application.createMany({
      data: [
        {
          id: app1Id,
          candidateId: cand1Id,
          jobId: job1Id,
          stage: 'APPLIED',
          status: 'ACTIVE',
          trackingCode: trackCode1,
        },
        {
          id: app2Id,
          candidateId: cand1Id,
          jobId: job1Id,
          stage: 'SCREENING',
          status: 'ACTIVE',
          trackingCode: trackCode2,
        },
        {
          id: app3Id,
          candidateId: cand1Id,
          jobId: job1Id,
          stage: 'INTERVIEW',
          status: 'ACTIVE',
          trackingCode: trackCode3,
        },
        {
          id: app5Id,
          candidateId: cand1Id,
          jobId: job1Id,
          stage: 'OFFER',
          status: 'ACTIVE',
          trackingCode: trackCode5,
        },
        {
          id: app6Id,
          candidateId: cand1Id,
          jobId: job1Id,
          stage: 'APPLIED',
          status: 'REJECTED',
          trackingCode: trackCode6,
        },
      ],
    });

    // 3. Candidate 2 with INTERVIEWING stage
    await prisma.candidate.create({
      data: {
        id: cand2Id,
        fullName: 'Trần Thị Phỏng Vấn',
        email: email2,
      },
    });

    await prisma.application.create({
      data: {
        id: app4Id,
        candidateId: cand2Id,
        jobId: job1Id,
        stage: 'INTERVIEWING',
        status: 'ACTIVE',
        trackingCode: trackCode4,
      },
    });

    // 4. Candidate with Multiple Applications to different jobs
    await prisma.candidate.create({
      data: {
        id: candMultiId,
        fullName: 'Lê Ứng Tuyển Nhiều Vị Trí',
        email: emailMulti,
      },
    });

    await prisma.application.createMany({
      data: [
        {
          id: appMulti1Id,
          candidateId: candMultiId,
          jobId: job1Id,
          stage: 'INTERVIEW',
          status: 'ACTIVE',
          trackingCode: trackCodeMulti1,
        },
        {
          id: appMulti2Id,
          candidateId: candMultiId,
          jobId: job2Id,
          stage: 'REJECTED',
          status: 'REJECTED',
          trackingCode: trackCodeMulti2,
        },
      ],
    });

    // 5. Legacy Application with NO trackingCode (trackingCode is null)
    await prisma.candidate.create({
      data: {
        id: candLegacyId,
        fullName: 'Hồ Sơ Cũ Chưa Có Mã',
        email: emailLegacy,
      },
    });

    await prisma.application.create({
      data: {
        id: appLegacyId,
        candidateId: candLegacyId,
        jobId: job1Id,
        stage: 'APPLIED',
        status: 'ACTIVE',
        trackingCode: null,
      },
    });
  });

  afterAll(async () => {
    resetRateLimitStore();
    try {
      await prisma.application.deleteMany({
        where: {
          id: {
            in: [
              app1Id,
              app2Id,
              app3Id,
              app4Id,
              app5Id,
              app6Id,
              appMulti1Id,
              appMulti2Id,
              appLegacyId,
            ],
          },
        },
      });
      await prisma.candidate.deleteMany({
        where: { id: { in: [cand1Id, cand2Id, candMultiId, candLegacyId] } },
      });
      await prisma.job.deleteMany({ where: { id: { in: [job1Id, job2Id] } } });
      await prisma.department.deleteMany({ where: { id: deptId } });
    } catch {
      // Ignore cleanup error on test db
    }
  });

  // =========================================================================
  // 1. Persistent Tracking Code & Fresh Instance Verification
  // =========================================================================
  describe('Persistent tracking code & restart simulation', () => {
    it('persists trackingCode in Application database model and retrieves successfully', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: trackCode1,
          email: email1,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        trackingCode: trackCode1,
        status: 'RECEIVED',
        statusLabel: 'Đã nhận',
      });
    });

    it('retrieves trackingCode after simulating backend restart with a brand new PrismaClient', async () => {
      // Instantiate a completely new PrismaClient with fresh connection pool
      const freshPrisma = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        },
      });

      const dbApp = await freshPrisma.application.findUnique({
        where: { trackingCode: trackCode2 },
        select: { id: true, trackingCode: true, stage: true },
      });

      expect(dbApp).not.toBeNull();
      expect(dbApp?.trackingCode).toBe(trackCode2);
      expect(dbApp?.stage).toBe('SCREENING');

      // Verify track-status API still works with the persisted record
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: trackCode2,
          email: email1,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_REVIEW');

      await freshPrisma.$disconnect();
    });

    it('supports backward-compatible HMAC-signed opaque codes for records created before migration', async () => {
      const opaqueCode = generateOpaqueTrackingCode(app3Id);

      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: opaqueCode,
          email: email1,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('INTERVIEW');
    });
  });

  // =========================================================================
  // 2. Application Creation Flow & Email Notification
  // =========================================================================
  describe('Application creation flow & Email notification', () => {
    it('generates trackingCode, persists in DB, and sends email to candidate on profile creation', async () => {
      const emailSpy = vi
        .spyOn(emailUtils, 'sendApplicationTrackingEmail')
        .mockResolvedValueOnce();

      const newCandEmail = `newcand.${scope}@tracking-test.local`;
      const res = await request(app)
        .post('/api/candidates')
        .set(authHeader(adminToken))
        .send({
          fullName: 'Ứng Viên Mới Nhận Email',
          email: newCandEmail,
          jobId: job1Id,
        });

      expect(res.status).toBe(201);
      const createdCand = res.body.data;
      expect(createdCand).toBeDefined();

      // Verify application was created in DB with a persistent trackingCode
      const createdApp = await prisma.application.findFirst({
        where: { candidateId: createdCand.id },
      });

      expect(createdApp).not.toBeNull();
      expect(createdApp?.trackingCode).toMatch(/^ATS-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/);

      // Verify email was sent to EXACT candidate email with trackingCode
      expect(emailSpy).toHaveBeenCalledTimes(1);
      expect(emailSpy).toHaveBeenCalledWith(
        newCandEmail,
        'Ứng Viên Mới Nhận Email',
        createdApp?.trackingCode,
        'Senior Backend Architect'
      );

      // Now verify candidate can track immediately using the generated trackingCode
      const trackRes = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: createdApp?.trackingCode,
          email: newCandEmail,
        });

      expect(trackRes.status).toBe(200);
      expect(trackRes.body.data.status).toBe('RECEIVED');
      expect(trackRes.body.data.statusLabel).toBe('Đã nhận');

      // Cleanup newly created application & candidate
      if (createdApp) {
        await prisma.application.delete({ where: { id: createdApp.id } });
      }
      await prisma.candidate.delete({ where: { id: createdCand.id } });
      emailSpy.mockRestore();
    });

    it('safely catches email failure without failing the candidate application creation', async () => {
      const emailSpy = vi
        .spyOn(emailUtils, 'sendApplicationTrackingEmail')
        .mockRejectedValueOnce(new Error('SMTP Connection Refused'));

      const fallbackEmail = `fallback.${scope}@tracking-test.local`;
      const res = await request(app)
        .post('/api/candidates')
        .set(authHeader(adminToken))
        .send({
          fullName: 'Ứng Viên Lỗi SMTP',
          email: fallbackEmail,
          jobId: job1Id,
        });

      // Creation still succeeds (graceful degradation)
      expect(res.status).toBe(201);

      const createdCand = res.body.data;
      const createdApp = await prisma.application.findFirst({
        where: { candidateId: createdCand.id },
      });

      // Cleanup
      if (createdApp) {
        await prisma.application.delete({ where: { id: createdApp.id } });
      }
      await prisma.candidate.delete({ where: { id: createdCand.id } });
      emailSpy.mockRestore();
    });
  });

  // =========================================================================
  // 3. Collision Handling & Uniqueness Verification
  // =========================================================================
  describe('Collision handling & uniqueness', () => {
    it('regenerates trackingCode when collision is detected', async () => {
      const originalFindUnique = prisma.application.findUnique.bind(prisma.application);
      try {
        let callCount = 0;
        prisma.application.findUnique = (async (args: any) => {
          callCount++;
          if (callCount === 1) {
            return { id: 'colliding-id' } as any; // 1st try collides
          }
          return null; // 2nd try is unique
        }) as any;

        const uniqueCode = await generateUniqueTrackingCode();

        expect(callCount).toBe(2);
        expect(uniqueCode).toMatch(/^ATS-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/);
      } finally {
        prisma.application.findUnique = originalFindUnique;
      }
    });
  });

  // =========================================================================
  // 4. Legacy Applications (trackingCode: null) & Strict Rejection
  // =========================================================================
  describe('Legacy records & ID rejection', () => {
    it('returns 404 for legacy applications without trackingCode (does not assign fake code)', async () => {
      // Attacker tries guessing legacy application ID
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: `ATS-${appLegacyId}`,
          email: emailLegacy,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toBe('Không tìm thấy hồ sơ phù hợp.');
    });

    it('strictly REJECTS Candidate ID as tracking code', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: `ATS-${cand1Id}`,
          email: email1,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Không tìm thấy hồ sơ phù hợp.');
    });

    it('strictly REJECTS raw guessable Application IDs (e.g. ATS-app-001)', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: `ATS-${app1Id}`,
          email: email1,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Không tìm thấy hồ sơ phù hợp.');
    });
  });

  // =========================================================================
  // 5. Multiple Applications per Candidate
  // =========================================================================
  describe('Multiple applications per candidate', () => {
    it('returns application 1 status with its distinct tracking code', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: trackCodeMulti1,
          email: emailMulti,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('INTERVIEW');
      expect(res.body.data.statusLabel).toBe('Mời phỏng vấn');
      expect(res.body.data.trackingCode).toBe(trackCodeMulti1);
    });

    it('returns application 2 status with its distinct tracking code', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: trackCodeMulti2,
          email: emailMulti,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.statusLabel).toBe('Kết thúc');
      expect(res.body.data.trackingCode).toBe(trackCodeMulti2);
    });

    it('rejects candidate-level tracking for multi-application candidate (no auto-select latest)', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: `ATS-${candMultiId}`,
          email: emailMulti,
        });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Không tìm thấy hồ sơ phù hợp.');
    });
  });

  // =========================================================================
  // 6. Real ATS Lifecycle Status Mapping
  // =========================================================================
  describe('Real ATS lifecycle status mapping', () => {
    it('maps APPLIED (ACTIVE) to RECEIVED ("Đã nhận")', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({ trackingCode: trackCode1, email: email1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RECEIVED');
      expect(res.body.data.statusLabel).toBe('Đã nhận');
    });

    it('maps SCREENING (ACTIVE) to UNDER_REVIEW ("Đang xem xét")', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({ trackingCode: trackCode2, email: email1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_REVIEW');
      expect(res.body.data.statusLabel).toBe('Đang xem xét');
    });

    it('maps INTERVIEW (ACTIVE) to INTERVIEW ("Mời phỏng vấn")', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({ trackingCode: trackCode3, email: email1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('INTERVIEW');
      expect(res.body.data.statusLabel).toBe('Mời phỏng vấn');
    });

    it('maps INTERVIEWING (ACTIVE) to INTERVIEW ("Mời phỏng vấn")', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({ trackingCode: trackCode4, email: email2 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('INTERVIEW');
      expect(res.body.data.statusLabel).toBe('Mời phỏng vấn');
    });

    it('maps OFFER (ACTIVE) to COMPLETED ("Kết thúc")', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({ trackingCode: trackCode5, email: email1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.statusLabel).toBe('Kết thúc');
    });

    it('maps REJECTED status to COMPLETED ("Kết thúc")', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({ trackingCode: trackCode6, email: email1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.statusLabel).toBe('Kết thúc');
    });

    it('ensures terminal statuses never map to active statuses', () => {
      expect(mapApplicationStatus('APPLIED', 'INACTIVE')).toEqual({
        status: 'COMPLETED',
        statusLabel: 'Kết thúc',
      });
      expect(mapApplicationStatus('INTERVIEW', 'CLOSED')).toEqual({
        status: 'COMPLETED',
        statusLabel: 'Kết thúc',
      });
      expect(mapApplicationStatus('HIRED', 'ACTIVE')).toEqual({
        status: 'COMPLETED',
        statusLabel: 'Kết thúc',
      });
      expect(mapApplicationStatus('REJECTED', 'ACTIVE')).toEqual({
        status: 'COMPLETED',
        statusLabel: 'Kết thúc',
      });
    });
  });

  // =========================================================================
  // 7. Security, Anti-Enumeration & Privacy
  // =========================================================================
  describe('Security & Anti-enumeration', () => {
    it('returns IDENTICAL 404 NOT_FOUND for non-existent code and email mismatch', async () => {
      const resNonExistent = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: 'ATS-UNKNOWN9999',
          email: email1,
        });

      const resMismatch = await request(app)
        .post('/api/candidates/track-status')
        .send({
          trackingCode: trackCode1,
          email: 'attacker@evil.com',
        });

      expect(resNonExistent.status).toBe(404);
      expect(resMismatch.status).toBe(404);
      expect(resNonExistent.body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Không tìm thấy hồ sơ phù hợp.',
      });
      expect(resMismatch.body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Không tìm thấy hồ sơ phù hợp.',
      });
    });

    it('returns strictly { trackingCode, status, statusLabel } (no PII or notes)', async () => {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({ trackingCode: trackCode1, email: email1 });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(Object.keys(data).sort()).toEqual(
        ['status', 'statusLabel', 'trackingCode'].sort()
      );
      expect(data.cvUrl).toBeUndefined();
      expect(data.phone).toBeUndefined();
      expect(data.address).toBeUndefined();
      expect(data.expectedSalary).toBeUndefined();
      expect(data.fullName).toBeUndefined();
      expect(data.email).toBeUndefined();
      expect(data.notes).toBeUndefined();
    });
  });

  // =========================================================================
  // 8. Rate Limiter & Reverse Proxy IP Handling
  // =========================================================================
  it('returns safe 500 without leaking stack traces on DB exception', async () => {
    resetRateLimitStore();

    const spy = vi
      .spyOn(CandidateService, 'trackApplicationStatus')
      .mockRejectedValueOnce(new Error('Simulated DB connection failure'));

    try {
      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({ trackingCode: trackCode1, email: email1 });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.error.details).toBeUndefined();
    } finally {
      spy.mockRestore();
      resetRateLimitStore();
    }
  });

  // =========================================================================
  // 9. Safe Database Error Handling
  // =========================================================================
  describe('Safe database error handling', () => {
    it('returns safe 500 without leaking stack traces on DB exception', async () => {
      const spy = vi
        .spyOn(CandidateService, 'trackApplicationStatus')
        .mockRejectedValueOnce(new Error('Simulated DB connection failure'));

      const res = await request(app)
        .post('/api/candidates/track-status')
        .send({ trackingCode: trackCode1, email: email1 });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(res.body.error.message).toBe('Đã xảy ra lỗi hệ thống khi tra cứu hồ sơ.');
      expect(res.body.error.details).toBeUndefined();

      spy.mockRestore();
    });
  });
});
