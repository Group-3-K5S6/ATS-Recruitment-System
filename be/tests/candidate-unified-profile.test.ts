/**
 * Candidate Unified Profile API — Acceptance Tests
 *
 * Endpoint: GET /api/candidates/:id/profile
 *
 * Scenarios covered:
 *  1. Full profile with applications, interviews, evaluations
 *  2. Candidate without CV (cvUrl null)
 *  3. Candidate without application history
 *  4. Multiple applications across jobs
 *  5. Recruiter assigned to requisition → CAN view
 *  6. Recruiter NOT assigned to requisition → 403
 *  7. Hiring Manager whose dept owns the job → CAN view
 *  8. Hiring Manager from different dept → 403
 *  9. CANDIDATE viewing own profile → 200, evaluations stripped
 * 10. CANDIDATE viewing another candidate → 403
 * 11. Unauthenticated request → 401
 * 12. Non-existent candidateId → 404
 * 13. Cross-candidate isolation: data from cand-A never leaks to cand-B response
 * 14. HR_MANAGER can view any profile (global read)
 * 15. ADMIN can view any profile
 */

import { randomUUID } from 'crypto';
import { existsSync, realpathSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';
import { hashPassword } from '../src/utils/password';

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
      'Unified-profile tests require NODE_ENV=test and a disposable _ats_regression_*.db database.'
    );
  }
};

const scope = randomUUID().slice(0, 12);
const fid = (tag: string) => `ucprof-${tag}-${scope}`;

describe('Candidate Unified Profile — GET /api/candidates/:id/profile', () => {
  let adminToken = '';
  let hrManagerToken = '';
  let recruiter1Token = '';
  let recruiter2Token = '';
  let hmEngToken = '';
  let candAToken = '';
  let candBToken = '';
  let recruiter1Id = '';
  let hmEngId = '';
  let hmMktId = '';
  let interviewer1Id = '';
  let engDeptId = '';
  let mktDeptId = '';
  let jobTitleId = '';

  const createdRequisitionIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdCandidateIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdInterviewIds: string[] = [];
  const createdEvaluationIds: string[] = [];
  const createdOfferIds: string[] = [];
  const createdUserIds: string[] = [];

  const candAId = fid('cand-a');
  const candBId = fid('cand-b');
  const candCId = fid('cand-c');
  const candDId = fid('cand-d');
  const jobA1Id = fid('job-a1');
  const jobA2Id = fid('job-a2');
  const jobB1Id = fid('job-b1');
  const reqA1Id = fid('req-a1');
  const reqB1Id = fid('req-b1');
  const appA1Id = fid('app-a1');
  const appD1Id = fid('app-d1');
  const appD2Id = fid('app-d2');
  const appB1Id = fid('app-b1');
  const iv1Id   = fid('iv-1');

  beforeAll(async () => {
    assertDisposableDatabase();

    const [admin, hr, r1, r2, hmEng, hmMkt, iv1] = await Promise.all([
      loginAndGetToken('admin@ats.local'),
      loginAndGetToken('hr_manager@ats.local'),
      loginAndGetToken('recruiter1@ats.local'),
      loginAndGetToken('recruiter2@ats.local'),
      loginAndGetToken('hiring_manager_eng@ats.local'),
      loginAndGetToken('hiring_manager_mkt@ats.local'),
      loginAndGetToken('interviewer1@ats.local'),
    ]);
    adminToken      = admin.token;
    hrManagerToken  = hr.token;
    recruiter1Token = r1.token;
    recruiter2Token = r2.token;
    hmEngToken      = hmEng.token;
    recruiter1Id    = r1.user.id;
    hmEngId         = hmEng.user.id;
    hmMktId         = hmMkt.user.id;
    interviewer1Id  = iv1.user.id;

    const [engDept, mktDept, jobTitle] = await Promise.all([
      prisma.department.findUniqueOrThrow({ where: { code: 'ENG' } }),
      prisma.department.findUniqueOrThrow({ where: { code: 'MKT' } }),
      prisma.jobTitle.findFirst({ where: { code: { startsWith: 'IT-' } } }),
    ]);
    engDeptId  = engDept.id;
    mktDeptId  = mktDept.id;
    jobTitleId = jobTitle?.id ?? '';

    const candidateRole = await prisma.role.findUniqueOrThrow({ where: { name: 'CANDIDATE' } });

    const candAPassword = randomUUID();
    const candBPassword = randomUUID();

    const [userCandA, userCandB] = await Promise.all([
      prisma.user.create({
        data: {
          id: fid('user-cand-a'),
          email: `ucprof-canda-${scope}@test.local`,
          fullName: 'Unified Profile Cand A',
          passwordHash: await hashPassword(candAPassword),
          roles: { create: { role: { connect: { id: candidateRole.id } } } },
        },
      }),
      prisma.user.create({
        data: {
          id: fid('user-cand-b'),
          email: `ucprof-candb-${scope}@test.local`,
          fullName: 'Unified Profile Cand B',
          passwordHash: await hashPassword(candBPassword),
          roles: { create: { role: { connect: { id: candidateRole.id } } } },
        },
      }),
    ]);
    createdUserIds.push(userCandA.id, userCandB.id);

    const [loginA, loginB] = await Promise.all([
      loginAndGetToken(`ucprof-canda-${scope}@test.local`, candAPassword),
      loginAndGetToken(`ucprof-candb-${scope}@test.local`, candBPassword),
    ]);
    candAToken = loginA.token;
    candBToken = loginB.token;

    const [reqA1, reqB1Rec] = await Promise.all([
      prisma.requisition.create({
        data: {
          id: reqA1Id,
          title: `UCP Test Req ENG ${scope}`,
          departmentId: engDeptId,
          hiringManagerId: hmEngId,
          headcount: 1,
          status: 'APPROVED',
          ...(jobTitleId ? { jobTitleId } : {}),
          leadRecruiterId: recruiter1Id,
        },
      }),
      prisma.requisition.create({
        data: {
          id: reqB1Id,
          title: `UCP Test Req MKT ${scope}`,
          departmentId: mktDeptId,
          hiringManagerId: hmMktId,   // MKT manager — hmEng must NOT see this
          headcount: 1,
          status: 'APPROVED',
        },
      }),
    ]);
    createdRequisitionIds.push(reqA1.id, reqB1Rec.id);

    const [jobA1Rec, jobA2Rec, jobB1Rec] = await Promise.all([
      prisma.job.create({
        data: {
          id: jobA1Id,
          title: 'UCP ENG Job A1',
          requisitionId: reqA1Id,
          departmentId: engDeptId,
          hiringManagerId: hmEngId,
          recruiterId: recruiter1Id,
          status: 'PUBLISHED',
          description: 'Test job A1',
        },
      }),
      prisma.job.create({
        data: {
          id: jobA2Id,
          title: 'UCP ENG Job A2',
          requisitionId: reqA1Id,
          departmentId: engDeptId,
          hiringManagerId: hmEngId,
          recruiterId: recruiter1Id,
          status: 'PUBLISHED',
          description: 'Test job A2',
        },
      }),
      prisma.job.create({
        data: {
          id: jobB1Id,
          title: 'UCP MKT Job B1',
          requisitionId: reqB1Id,
          departmentId: mktDeptId,
          hiringManagerId: hmMktId,   // MKT manager — hmEng is not the HM here
          status: 'PUBLISHED',
          description: 'Test job B1',
        },
      }),
    ]);
    createdJobIds.push(jobA1Rec.id, jobA2Rec.id, jobB1Rec.id);

    const [candA, candB, candC, candD] = await Promise.all([
      prisma.candidate.create({
        data: {
          id: candAId,
          userId: userCandA.id,
          fullName: 'Cand A Full',
          email: `ucprof-canda-${scope}@test.local`,
          phone: '0912345678',
          cvUrl: `https://storage.example.com/cv/${scope}-a.pdf`,
          address: '123 Main St',
          expectedSalary: 25000000,
          currentCompany: 'Old Corp A',
        },
      }),
      prisma.candidate.create({
        data: {
          id: candBId,
          userId: userCandB.id,
          fullName: 'Cand B No CV',
          email: `ucprof-candb-${scope}@test.local`,
          phone: '0987654321',
          cvUrl: null,
          currentCompany: 'Old Corp B',
        },
      }),
      prisma.candidate.create({
        data: {
          id: candCId,
          fullName: 'Cand C No Apps',
          email: `ucprof-candc-${scope}@test.local`,
        },
      }),
      prisma.candidate.create({
        data: {
          id: candDId,
          fullName: 'Cand D Multi App',
          email: `ucprof-candd-${scope}@test.local`,
          phone: '0911111111',
          expectedSalary: 30000000,
        },
      }),
    ]);
    createdCandidateIds.push(candA.id, candB.id, candC.id, candD.id);

    const [appA1, appD1, appD2, appB1] = await Promise.all([
      prisma.application.create({ data: { id: appA1Id, candidateId: candAId, jobId: jobA1Id, stage: 'INTERVIEW', status: 'ACTIVE' } }),
      prisma.application.create({ data: { id: appD1Id, candidateId: candDId, jobId: jobA1Id, stage: 'APPLIED',   status: 'ACTIVE' } }),
      prisma.application.create({ data: { id: appD2Id, candidateId: candDId, jobId: jobA2Id, stage: 'OFFER',     status: 'ACTIVE' } }),
      prisma.application.create({ data: { id: appB1Id, candidateId: candBId, jobId: jobB1Id, stage: 'APPLIED',   status: 'ACTIVE' } }),
    ]);
    createdApplicationIds.push(appA1.id, appD1.id, appD2.id, appB1.id);

    const iv1Rec = await prisma.interview.create({
      data: {
        id: iv1Id,
        applicationId: appA1Id,
        interviewerId: interviewer1Id,
        scheduledAt: new Date('2026-12-15T09:00:00Z'),
        durationMinutes: 60,
        status: 'SCHEDULED',
      },
    });
    createdInterviewIds.push(iv1Rec.id);

    const evalRec = await prisma.evaluation.create({
      data: {
        interviewId: iv1Id,
        interviewerId: interviewer1Id,
        score: 85,
        technicalNotes: 'Strong TypeScript knowledge',
        culturalNotes: 'Good cultural fit',
        recommendation: 'HIRE',
      },
    });
    createdEvaluationIds.push(evalRec.id);

    const offerRec = await prisma.offer.create({
      data: {
        applicationId: appA1Id,
        recruiterId: recruiter1Id,
        baseSalary: 25000000,
        status: 'DRAFT',
        internalNotes: 'Internal: candidate is negotiable',
      },
    });
    createdOfferIds.push(offerRec.id);
  });

  afterAll(async () => {
    if (createdEvaluationIds.length)
      await prisma.evaluation.deleteMany({ where: { id: { in: createdEvaluationIds } } });
    if (createdOfferIds.length)
      await prisma.offer.deleteMany({ where: { id: { in: createdOfferIds } } });
    if (createdInterviewIds.length)
      await prisma.interview.deleteMany({ where: { id: { in: createdInterviewIds } } });
    if (createdApplicationIds.length)
      await prisma.application.deleteMany({ where: { id: { in: createdApplicationIds } } });
    if (createdCandidateIds.length)
      await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
    if (createdJobIds.length)
      await prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
    if (createdRequisitionIds.length) {
      await prisma.requisitionApprovalHistory.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } });
      await prisma.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } });
    }
    if (createdUserIds.length) {
      await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  // -------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get(`/api/candidates/${candAId}/profile`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent candidateId', async () => {
    const res = await request(app)
      .get(`/api/candidates/${randomUUID()}/profile`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  // -------------------------------------------------------------------
  // ADMIN — full access
  // -------------------------------------------------------------------
  describe('ADMIN access', () => {
    it('returns 200 with full profile for cand A', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(adminToken));
      expect(res.status).toBe(200);
      const profile = res.body.data;
      expect(profile.id).toBe(candAId);
      expect(profile.cvUrl).toBeTruthy();
      expect(Array.isArray(profile.applications)).toBe(true);

      const appRec = profile.applications.find((a: any) => a.id === appA1Id);
      expect(appRec).toBeDefined();
      expect(appRec.job.id).toBe(jobA1Id);
      expect(appRec.job.department).toBeDefined();
      expect(appRec.job.hiringManager).toBeDefined();

      const iv = appRec.interviews.find((i: any) => i.id === iv1Id);
      expect(iv).toBeDefined();
      expect(Array.isArray(iv.evaluations)).toBe(true);
      expect(iv.evaluations[0].score).toBe(85);

      expect(Array.isArray(appRec.offers)).toBe(true);
      expect(appRec.offers.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 200 with empty application history for cand C', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candCId}/profile`)
        .set(authHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.applications).toHaveLength(0);
    });

    it('returns 200 with null cvUrl for cand B', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candBId}/profile`)
        .set(authHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.cvUrl).toBeNull();
    });

    it('cand D has multiple applications in history', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candDId}/profile`)
        .set(authHeader(adminToken));
      expect(res.status).toBe(200);
      const ids = res.body.data.applications.map((a: any) => a.id);
      expect(ids).toContain(appD1Id);
      expect(ids).toContain(appD2Id);
    });
  });

  // -------------------------------------------------------------------
  // HR_MANAGER — same global access
  // -------------------------------------------------------------------
  describe('HR_MANAGER access', () => {
    it('can view cand A', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(hrManagerToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(candAId);
    });

    it('can view cand C who has no applications', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candCId}/profile`)
        .set(authHeader(hrManagerToken));
      expect(res.status).toBe(200);
      expect(res.body.data.applications).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // RECRUITER scoped — S3-06 assignment rule
  // -------------------------------------------------------------------
  describe('RECRUITER scoped access', () => {
    it('assigned recruiter CAN view cand A (application on assigned requisition)', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(recruiter1Token));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(candAId);
    });

    it('assigned recruiter sees application history with interviews', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(recruiter1Token));
      const appRec = res.body.data.applications.find((a: any) => a.id === appA1Id);
      expect(appRec).toBeDefined();
      expect(Array.isArray(appRec.interviews)).toBe(true);
    });

    it('unassigned recruiter (recruiter2) is DENIED 403 for cand A', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(recruiter2Token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('recruiter1 CANNOT view cand C who has no applications', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candCId}/profile`)
        .set(authHeader(recruiter1Token));
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------
  // HIRING_MANAGER scoped access
  // -------------------------------------------------------------------
  describe('HIRING_MANAGER scoped access', () => {
    it('hmEng CAN view cand A who applied to ENG dept job', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(hmEngToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(candAId);
    });

    it('hmEng is DENIED cand B who only applied to MKT dept job', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candBId}/profile`)
        .set(authHeader(hmEngToken));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('address field is NOT exposed to hiring manager', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(hmEngToken));
      expect(res.status).toBe(200);
      expect(res.body.data.address).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------
  // CANDIDATE — own profile, evaluation stripping
  // -------------------------------------------------------------------
  describe('CANDIDATE own profile access', () => {
    it('candidate A can view own unified profile', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(candAToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(candAId);
    });

    it('evaluation details are stripped from CANDIDATE view (internal data)', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(candAToken));
      expect(res.status).toBe(200);
      for (const app of res.body.data.applications ?? []) {
        for (const iv of app.interviews ?? []) {
          expect(iv.evaluations).toBeUndefined();
        }
      }
    });

    it('candidate A CANNOT view candidate B profile — 403', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candBId}/profile`)
        .set(authHeader(candAToken));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('internalNotes on offers is never exposed to candidate', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(candAToken));
      expect(res.status).toBe(200);
      for (const app of res.body.data.applications ?? []) {
        for (const offer of app.offers ?? []) {
          expect(offer.internalNotes).toBeUndefined();
        }
      }
    });
  });

  // -------------------------------------------------------------------
  // Cross-candidate data isolation
  // -------------------------------------------------------------------
  describe('Cross-candidate data isolation', () => {
    it('profile for cand A never includes applications from cand D', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(adminToken));
      const candIds = res.body.data.applications.map((a: any) => a.candidateId);
      for (const cid of candIds) {
        expect(cid).toBe(candAId);
      }
    });

    it('profile for cand D only includes its own two applications', async () => {
      const res = await request(app)
        .get(`/api/candidates/${candDId}/profile`)
        .set(authHeader(adminToken));
      const ids = res.body.data.applications.map((a: any) => a.id);
      expect(ids).toContain(appD1Id);
      expect(ids).toContain(appD2Id);
      expect(ids).not.toContain(appA1Id);
    });
  });

  // -------------------------------------------------------------------
  // Chronological ordering of applications
  // -------------------------------------------------------------------
  it('applications are sorted most-recent first', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candDId}/profile`)
      .set(authHeader(adminToken));
    const apps: any[] = res.body.data.applications;
    if (apps.length > 1) {
      const dates = apps.map((a) => new Date(a.createdAt).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
      }
    }
  });
});
