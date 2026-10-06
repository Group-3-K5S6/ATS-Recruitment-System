import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAndGetToken, authHeader } from './test-helper';
import { prisma } from '../src/database/prisma';

describe('3. Resource Scope & Ownership Authorization', () => {
  let hmEngToken: string;
  let hmMktToken: string;
  let interviewer1Token: string;
  let candidate1Token: string;
  let candidate2Token: string;
  let mktDeptId: string;
  let engDeptId: string;

  beforeAll(async () => {
    hmEngToken = (await loginAndGetToken('hiring_manager_eng@ats.local')).token;
    hmMktToken = (await loginAndGetToken('hiring_manager_mkt@ats.local')).token;
    interviewer1Token = (await loginAndGetToken('interviewer1@ats.local')).token;
    candidate1Token = (await loginAndGetToken('candidate1@ats.local')).token;
    candidate2Token = (await loginAndGetToken('candidate2@ats.local')).token;

    const engDept = await prisma.department.findUnique({ where: { code: 'ENG' } });
    const mktDept = await prisma.department.findUnique({ where: { code: 'MKT' } });
    engDeptId = engDept!.id;
    mktDeptId = mktDept!.id;
  });

  describe('Hiring Manager Scoped Access', () => {
    it('CAN view candidate applied to their department job (cand-001)', async () => {
      const res = await request(app)
        .get('/api/candidates/cand-001')
        .set(authHeader(hmEngToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('cand-001');
    });

    it('DENIED (403) from viewing candidate applied to another department job (cand-002)', async () => {
      const res = await request(app)
        .get('/api/candidates/cand-002')
        .set(authHeader(hmEngToken));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('CAN create requisition for own department (ENG)', async () => {
      const res = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hmEngToken))
        .send({
          title: 'New Senior QA Engineer',
          departmentId: engDeptId,
          headcount: 1,
          budget: 30000000,
        });
      expect(res.status).toBe(201);
    });

    it('DENIED (403) from creating requisition for another department (MKT)', async () => {
      const res = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hmEngToken))
        .send({
          title: 'Unauthorized MKT Requisition',
          departmentId: mktDeptId,
          headcount: 1,
        });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });
  });

  describe('Interviewer Scoped Access', () => {
    it('CAN view candidate they are assigned to interview (cand-001)', async () => {
      const res = await request(app)
        .get('/api/candidates/cand-001')
        .set(authHeader(interviewer1Token));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('cand-001');
    });

    it('DENIED (403) from viewing candidate they are not assigned to interview (cand-002)', async () => {
      const res = await request(app)
        .get('/api/candidates/cand-002')
        .set(authHeader(interviewer1Token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('CAN view interview assigned to them (interview-001)', async () => {
      const res = await request(app)
        .get('/api/interviews/interview-001')
        .set(authHeader(interviewer1Token));
      expect(res.status).toBe(200);
    });
  });

  describe('Candidate Scoped Access', () => {
    it('CAN view their own candidate profile (cand-001)', async () => {
      const res = await request(app)
        .get('/api/candidates/cand-001')
        .set(authHeader(candidate1Token));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('cand-001');
    });

    it('DENIED (403) from viewing another candidate profile (cand-002)', async () => {
      const res = await request(app)
        .get('/api/candidates/cand-002')
        .set(authHeader(candidate1Token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('CAN view interview scheduled for their own application', async () => {
      const res = await request(app)
        .get('/api/interviews/interview-001')
        .set(authHeader(candidate1Token));
      expect(res.status).toBe(200);
    });
  });
});
