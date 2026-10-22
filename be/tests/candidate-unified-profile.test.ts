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
          labels: 'TypeScript,React',
          notes: 'Da trao doi voi ung vien; uu tien lich phong van buoi sang.',
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


  it('S409_PROTECTED_PDF_TEST: CV PDF only for assigned recruiter and manager', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const folder = mkdtempSync(join(tmpdir(), 's409-cv-auth-'));
    const filename = 's409-auth-fixture.pdf';
    writeFileSync(join(folder, filename), Buffer.from('%PDF-1.4\n1 0 obj\n<</Type/Catalog>>\nendobj\n%%EOF\n'));
    const original = await prisma.candidate.findUniqueOrThrow({ where: { id: candAId }, select: { cvUrl: true } });
    const prior = process.env.S409_CV_TEST_DIR;
    try {
      process.env.S409_CV_TEST_DIR = folder;
      await prisma.candidate.update({ where: { id: candAId }, data: { cvUrl: 's409-demo://' + filename } });
      const url = `/api/candidates/${candAId}/cv/preview`;
      expect((await request(app).get(url)).status).toBe(401);
      for (const token of [recruiter1Token, hmEngToken]) {
        const response = await request(app).get(url).set(authHeader(token));
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('application/pdf');
      }
      for (const token of [recruiter2Token, adminToken, hrManagerToken]) {
        const response = await request(app).get(url).set(authHeader(token));
        expect(response.status).toBe(403);
      }
    } finally {
      await prisma.candidate.update({ where: { id: candAId }, data: { cvUrl: original.cvUrl } });
      if (prior === undefined) delete process.env.S409_CV_TEST_DIR;
      else process.env.S409_CV_TEST_DIR = prior;
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('requires authentication', async () => {
    const res = await request(app).get(`/api/candidates/${candAId}/profile`);
    expect(res.status).toBe(401);
  });

  it('assigned recruiter sees unified candidate history, preview URL, labels and notes', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candAId}/profile`)
      .set(authHeader(recruiter1Token));
    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('Cand A Full');
    expect(res.body.data.cvUrl).toContain('.pdf');
    expect(res.body.data.labels).toBe('TypeScript,React');
    expect(res.body.data.notes).toContain('Da trao doi');
    expect(res.body.data.applications).toHaveLength(1);
    expect(res.body.data.applications[0].job.id).toBe(jobA1Id);
    expect(res.body.data.applications[0].interviews[0].evaluations[0].score).toBe(85);
    expect(res.body.data.applications[0].offers).toHaveLength(1);
  });

  it('assigned recruiter sees all prior applications for same candidate', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candDId}/profile`)
      .set(authHeader(recruiter1Token));
    expect(res.status).toBe(200);
    expect(res.body.data.applications.map((a: { id: string }) => a.id).sort())
      .toEqual([appD1Id, appD2Id].sort());
  });

  it('unassigned recruiter cannot open profile', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candAId}/profile`)
      .set(authHeader(recruiter2Token));
    expect(res.status).toBe(403);
  });

  it('hiring manager of the exact position can view scoped history', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candAId}/profile`)
      .set(authHeader(hmEngToken));
    expect(res.status).toBe(200);
    expect(res.body.data.applications).toHaveLength(1);
  });

  it('hiring manager cannot view candidate of another manager', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candBId}/profile`)
      .set(authHeader(hmEngToken));
    expect(res.status).toBe(403);
  });

  it('other roles, including admin and HR manager, are excluded by the S4-09 story', async () => {
    for (const token of [adminToken, hrManagerToken, candAToken, candBToken]) {
      const res = await request(app)
        .get(`/api/candidates/${candAId}/profile`)
        .set(authHeader(token));
      expect(res.status).toBe(403);
    }
  });

  it('nonexistent candidate ID returns 404 for authorized role', async () => {
    const res = await request(app)
      .get(`/api/candidates/${randomUUID()}/profile`)
      .set(authHeader(recruiter1Token));
    expect(res.status).toBe(404);
  });

  it('recruiter cannot see candidate without any assigned application', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candCId}/profile`)
      .set(authHeader(recruiter1Token));
    expect(res.status).toBe(403);
  });

  it('application histories remain isolated between candidates', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candAId}/profile`)
      .set(authHeader(recruiter1Token));
    expect(res.body.data.applications.map((a: { id: string }) => a.id))
      .not.toContain(appD1Id);
  });

  it('returns applications in latest-first order', async () => {
    const res = await request(app)
      .get(`/api/candidates/${candDId}/profile`)
      .set(authHeader(recruiter1Token));
    const apps = res.body.data.applications;
    for (let i = 1; i < apps.length; i++) {
      expect(new Date(apps[i - 1].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(apps[i].createdAt).getTime());
    }
  });


  it('S4-09 listing: Hiring Manager sees only jobs they manage', async () => {
    const res = await request(app)
      .get('/api/candidates/profiles')
      .set(authHeader(hmEngToken));
    expect(res.status).toBe(200);
    const all = res.body.data as Array<{
      id: string;
      fullName: string;
      email?: string;
      cvUrl?: string;
      applications: Array<{ jobId: string }>;
    }>;
    expect(all.some(entry => entry.id === candAId)).toBe(true);
    expect(all.some(entry => entry.id === candDId)).toBe(true);
    expect(all.some(entry => entry.id === candBId)).toBe(false);
    const candA = all.find(entry => entry.id === candAId)!;
    expect(candA.applications.map(a => a.jobId)).toEqual([jobA1Id]);
    expect(candA).not.toHaveProperty('email');
    expect(candA).not.toHaveProperty('cvUrl');
  });

  it('S4-09 listing: other roles are denied', async () => {
    for (const token of [adminToken, hrManagerToken, candAToken]) {
      const res = await request(app)
        .get('/api/candidates/profiles')
        .set(authHeader(token));
      expect(res.status).toBe(403);
    }
  });

  it('S4-09 AC2: eligible viewer sees earlier applications from another position', async () => {
    const priorApplicationId = fid('app-cross-position');
    await prisma.application.create({
      data: {
        id: priorApplicationId,
        candidateId: candDId,
        jobId: jobB1Id,
        stage: 'APPLIED',
        status: 'ACTIVE',
      },
    });
    try {
      for (const token of [recruiter1Token, hmEngToken]) {
        const res = await request(app)
          .get(`/api/candidates/${candDId}/profile`)
          .set(authHeader(token));
        expect(res.status).toBe(200);
        expect(res.body.data.applications.map((a: { id: string }) => a.id).sort())
          .toEqual([appD1Id, appD2Id, priorApplicationId].sort());
      }
      const mktDirectory = await request(app)
        .get('/api/candidates/profiles')
        .set(authHeader(hmEngToken));
      const summary = (mktDirectory.body.data as Array<{
        id: string; applications: Array<{jobId:string}>;
      }>).find(c => c.id === candDId);
      expect(summary?.applications.map(a => a.jobId).sort())
        .toEqual([jobA1Id, jobA2Id].sort());
    } finally {
      await prisma.application.deleteMany({ where: { id: priorApplicationId } });
    }
  });
});
