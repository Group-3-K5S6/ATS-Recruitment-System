/**
 * S3-06 / PR #81 — targeted API acceptance tests (AC1 / AC2 / AC3).
 * REVIEW-ONLY: RUN SOLELY with disposable _ats_regression_*.db inside this worktree.
 * The test creates unique fixtures, then cleans up its own records.
 * These tests deliberately fail if authorization or audit behavior regresses.
 */
import { randomUUID } from 'crypto';
import { existsSync, realpathSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

const scope = randomUUID().slice(0, 12);
const requisitionAId = `s306-a-${scope}`;
const requisitionBId = `s306-b-${scope}`;
const jobAId = `s306-job-a-${scope}`;
const jobBId = `s306-job-b-${scope}`;
const candidateAId = `s306-cand-a-${scope}`;
const candidateBId = `s306-cand-b-${scope}`;
const applicationAId = `s306-app-a-${scope}`;
const applicationBId = `s306-app-b-${scope}`;

const assertDisposableDatabase = () => {
  // Fail closed: never run destructive acceptance tests against MAIN or an arbitrary database.
  const candidate = /^file:\.\/(_ats_regression_[0-9a-f]{32}\.db)$/i.exec(process.env.DATABASE_URL ?? '');
  const cwd = process.cwd();
  const dir = resolve(cwd, 'prisma');
  const file = candidate ? resolve(dir, candidate[1]) : '';
  const canonicalDir = existsSync(dir) ? realpathSync(dir) : '';
  const canonicalFile = file && existsSync(file) ? realpathSync(file) : '';
  if (
    process.env.NODE_ENV !== 'test' ||
    basename(cwd).toLowerCase() !== 'be' ||
    !canonicalFile || !canonicalDir ||
    dirname(canonicalFile).toLowerCase() !== canonicalDir.toLowerCase()
  ) {
    throw new Error('S3-06 REVIEW TEST: requires NODE_ENV=test and disposable _ats_regression_*.db in this worktree.');
  }
};

describe('S3-06 / PR81 — Recruiter assignment, scope and history', () => {
  let hrToken = '';
  let recruiter1Token = '';
  let recruiter2Token = '';
  let hrId = '';
  let recruiter1Id = '';
  let recruiter2Id = '';

  beforeAll(async () => {
    assertDisposableDatabase();

    const [hr, r1, r2, engDept, hiringManager] = await Promise.all([
      loginAndGetToken('hr_manager@ats.local'),
      loginAndGetToken('recruiter1@ats.local'),
      loginAndGetToken('recruiter2@ats.local'),
      prisma.department.findUniqueOrThrow({ where: { code: 'ENG' } }),
      prisma.user.findUniqueOrThrow({ where: { email: 'hiring_manager_eng@ats.local' } }),
    ]);
    hrToken = hr.token;
    hrId = hr.user.id;
    recruiter1Token = r1.token;
    recruiter1Id = r1.user.id;
    recruiter2Token = r2.token;
    recruiter2Id = r2.user.id;

    // Isolated requisitions and applications; no edits to seeded requisitions/users.
    await prisma.requisition.createMany({
      data: [
        { id: requisitionAId, title: `S3-06 assigned ${scope}`, departmentId: engDept.id,
          hiringManagerId: hiringManager.id, status: 'DRAFT' },
        { id: requisitionBId, title: `S3-06 unassigned ${scope}`, departmentId: engDept.id,
          hiringManagerId: hiringManager.id, status: 'DRAFT' },
      ],
    });
    // Intentionally leave stale job/application assignments: these must NOT grant AC2 access.
    await prisma.job.createMany({
      data: [
        { id: jobAId, requisitionId: requisitionAId, title: 'S3-06 Job A',
          departmentId: engDept.id, hiringManagerId: hiringManager.id,
          recruiterId: recruiter1Id, description: 'Review fixture A', status: 'DRAFT' },
        { id: jobBId, requisitionId: requisitionBId, title: 'S3-06 Job B',
          departmentId: engDept.id, hiringManagerId: hiringManager.id,
          recruiterId: recruiter1Id, description: 'Review fixture B', status: 'DRAFT' },
      ],
    });
    await prisma.candidate.createMany({
      data: [
        { id: candidateAId, fullName: 'S3-06 Candidate A',
          email: `s306-a-${scope}@ats.local`, cvUrl: 'https://example.test/s306-a.pdf' },
        { id: candidateBId, fullName: 'S3-06 Candidate B',
          email: `s306-b-${scope}@ats.local`, cvUrl: 'https://example.test/s306-b.pdf' },
      ],
    });
    await prisma.application.createMany({
      data: [
        { id: applicationAId, candidateId: candidateAId, jobId: jobAId,
          assignedRecruiterId: recruiter1Id, status: 'ACTIVE' },
        { id: applicationBId, candidateId: candidateBId, jobId: jobBId,
          assignedRecruiterId: recruiter1Id, status: 'ACTIVE' },
      ],
    });
  });

  afterAll(async () => {
    assertDisposableDatabase();
    // Restrict all deletes to this test's randomly generated IDs.
    await prisma.application.deleteMany({ where: { id: { in: [applicationAId, applicationBId] } } });
    await prisma.job.deleteMany({ where: { id: { in: [jobAId, jobBId] } } });
    await prisma.requisitionAssignmentHistory.deleteMany({ where: { requisitionId: { in: [requisitionAId, requisitionBId] } } });
    await prisma.requisitionSupportingRecruiter.deleteMany({ where: { requisitionId: { in: [requisitionAId, requisitionBId] } } });
    await prisma.requisition.deleteMany({ where: { id: { in: [requisitionAId, requisitionBId] } } });
    await prisma.candidate.deleteMany({ where: { id: { in: [candidateAId, candidateBId] } } });
  });

  it('AC2: stale Job/Application recruiter IDs do NOT grant candidate access', async () => {
    const res = await request(app).get(`/api/candidates/${candidateAId}`).set(authHeader(recruiter1Token));
    expect(res.status).toBe(403);
    const apps = await request(app).get(`/api/requisitions/${requisitionAId}/applications`).set(authHeader(recruiter1Token));
    expect(apps.status).toBe(403);
  });

  it('AC1: a recruiter cannot assign themselves to requisitions', async () => {
    const res = await request(app).post(`/api/requisitions/${requisitionAId}/assign`)
      .set(authHeader(recruiter1Token))
      .send({ leadRecruiterId: recruiter1Id, supportingRecruiterIds: [] });
    expect(res.status).toBe(403);
  });

  it('AC1: lead cannot simultaneously be a supporting recruiter', async () => {
    const res = await request(app).post(`/api/requisitions/${requisitionAId}/assign`)
      .set(authHeader(hrToken))
      .send({ leadRecruiterId: recruiter1Id, supportingRecruiterIds: [recruiter1Id] });
    expect(res.status).toBe(400);
  });

  it('AC1: HR manager cannot be assigned as recruiter lead', async () => {
    const res = await request(app).post(`/api/requisitions/${requisitionAId}/assign`)
      .set(authHeader(hrToken))
      .send({ leadRecruiterId: hrId, supportingRecruiterIds: [] });
    expect(res.status).toBe(400);
  });

  it('AC1+AC3: HR manager assigns one lead and one supporting recruiter with history', async () => {
    const res = await request(app).post(`/api/requisitions/${requisitionAId}/assign`)
      .set(authHeader(hrToken))
      .send({ leadRecruiterId: recruiter1Id, supportingRecruiterIds: [recruiter2Id], notes: 'Initial S3-06 assignment' });
    expect(res.status).toBe(200);

    const req = await prisma.requisition.findUniqueOrThrow({
      where: { id: requisitionAId }, include: { supportingRecruiters: true },
    });
    expect(req.leadRecruiterId).toBe(recruiter1Id);
    expect(req.supportingRecruiters.map((x) => x.recruiterId)).toEqual([recruiter2Id]);
    const history = await prisma.requisitionAssignmentHistory.findMany({ where: { requisitionId: requisitionAId } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      action: 'ASSIGN', actorId: hrId, previousLeadRecruiterId: null,
      newLeadRecruiterId: recruiter1Id,
    });
    expect(JSON.parse(history[0].supportingRecruiterIds || '[]')).toEqual([recruiter2Id]);
  });

  it('AC2: lead AND supporting recruiter can see candidates on assigned requisition', async () => {
    for (const token of [recruiter1Token, recruiter2Token]) {
      const res = await request(app).get(`/api/requisitions/${requisitionAId}/applications`)
        .set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.map((x: { id: string }) => x.id)).toContain(applicationAId);
      const candidate = await request(app).get(`/api/candidates/${candidateAId}`).set(authHeader(token));
      expect(candidate.status).toBe(200);
    }
  });

  it('AC2: assigned recruiter cannot browse unrelated candidates, CVs, edits, deletes, or requisition applications', async () => {
    const list = await request(app).get('/api/candidates').set(authHeader(recruiter1Token));
    expect(list.status).toBe(200);
    const ids = list.body.data.map((x: { id: string }) => x.id);
    expect(ids).toContain(candidateAId);
    expect(ids).not.toContain(candidateBId);

    const read = await request(app).get(`/api/candidates/${candidateBId}`).set(authHeader(recruiter1Token));
    expect(read.status).toBe(403);
    const cv = await request(app).get(`/api/candidates/${candidateBId}/cv`).set(authHeader(recruiter1Token));
    expect(cv.status).toBe(403);
    const edit = await request(app).put(`/api/candidates/${candidateBId}`)
      .set(authHeader(recruiter1Token)).send({ fullName: 'Should never save' });
    expect(edit.status).toBe(403);
    const remove = await request(app).delete(`/api/candidates/${candidateBId}`)
      .set(authHeader(recruiter1Token));
    expect(remove.status).toBe(403);
    const unrelatedApps = await request(app).get(`/api/requisitions/${requisitionBId}/applications`)
      .set(authHeader(recruiter1Token));
    expect(unrelatedApps.status).toBe(403);
  });

  it('AC3: identical repeated assignment does not generate duplicate history', async () => {
    const before = await prisma.requisitionAssignmentHistory.count({ where: { requisitionId: requisitionAId } });
    const res = await request(app).put(`/api/requisitions/${requisitionAId}/assign`)
      .set(authHeader(hrToken))
      .send({ leadRecruiterId: recruiter1Id, supportingRecruiterIds: [recruiter2Id] });
    expect(res.status).toBe(200);
    const after = await prisma.requisitionAssignmentHistory.count({ where: { requisitionId: requisitionAId } });
    expect(after).toBe(before);
  });

  it('AC3: handover transfers access and synchronizes Job lead, writing HANDOVER', async () => {
    const res = await request(app).put(`/api/requisitions/${requisitionAId}/assign`)
      .set(authHeader(hrToken))
      .send({ leadRecruiterId: recruiter2Id, supportingRecruiterIds: [], notes: 'Handover to recruiter 2' });
    expect(res.status).toBe(200);
    const req = await prisma.requisition.findUniqueOrThrow({ where: { id: requisitionAId } });
    expect(req.leadRecruiterId).toBe(recruiter2Id);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobAId } });
    expect(job.recruiterId).toBe(recruiter2Id);
    const history = await prisma.requisitionAssignmentHistory.findMany({
      where: { requisitionId: requisitionAId }, orderBy: { createdAt: 'asc' },
    });
    expect(history).toHaveLength(2);
    expect(history.some((x) => x.action === 'HANDOVER' && x.previousLeadRecruiterId === recruiter1Id && x.newLeadRecruiterId === recruiter2Id)).toBe(true);
  });

  it('AC2: after handover, former lead loses access even if Application points to them', async () => {
    const denied = await request(app).get(`/api/candidates/${candidateAId}`).set(authHeader(recruiter1Token));
    expect(denied.status).toBe(403);
    const deniedCv = await request(app).get(`/api/candidates/${candidateAId}/cv`).set(authHeader(recruiter1Token));
    expect(deniedCv.status).toBe(403);
    const allowed = await request(app).get(`/api/candidates/${candidateAId}`).set(authHeader(recruiter2Token));
    expect(allowed.status).toBe(200);
  });

  it('AC1+AC3: generic PUT updates ONLY supporting recruiter and writes UPDATE_SUPPORTING', async () => {
    const res = await request(app).put(`/api/requisitions/${requisitionAId}`)
      .set(authHeader(hrToken)).send({ isDraft: true, supportingRecruiterIds: [recruiter1Id] });
    expect(res.status).toBe(200);
    const req = await prisma.requisition.findUniqueOrThrow({
      where: { id: requisitionAId }, include: { supportingRecruiters: true },
    });
    expect(req.leadRecruiterId).toBe(recruiter2Id);
    expect(req.supportingRecruiters.map((x) => x.recruiterId)).toEqual([recruiter1Id]);
    const history = await prisma.requisitionAssignmentHistory.findMany({ where: { requisitionId: requisitionAId } });
    expect(history).toHaveLength(3);
    expect(history.some((x) => x.action === 'UPDATE_SUPPORTING' && x.actorId === hrId)).toBe(true);
  });

  it('AC2: newly added supporting recruiter regains access', async () => {
    const allowed = await request(app).get(`/api/candidates/${candidateAId}`).set(authHeader(recruiter1Token));
    expect(allowed.status).toBe(200);
  });

  it('AC3: assignment-history API exposes audit actor and assignment actions', async () => {
    const res = await request(app).get(`/api/requisitions/${requisitionAId}/assignment-history`)
      .set(authHeader(hrToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    const actions = res.body.data.map((x: { action: string }) => x.action);
    expect(actions).toContain('ASSIGN');
    expect(actions).toContain('HANDOVER');
    expect(actions).toContain('UPDATE_SUPPORTING');
    expect(res.body.data.every((x: { actorId: string }) => x.actorId === hrId)).toBe(true);
  });
});
