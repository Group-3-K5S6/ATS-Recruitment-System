import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAndGetToken, authHeader } from './test-helper';

describe('2. Role-Based Access Control (RBAC) Matrix Verification', () => {
  let adminToken: string;
  let hrManagerToken: string;
  let recruiterToken: string;
  let hiringManagerToken: string;
  let interviewerToken: string;
  let approverToken: string;
  let candidateToken: string;

  beforeAll(async () => {
    adminToken = (await loginAndGetToken('admin@ats.local')).token;
    hrManagerToken = (await loginAndGetToken('hr_manager@ats.local')).token;
    recruiterToken = (await loginAndGetToken('recruiter1@ats.local')).token;
    hiringManagerToken = (await loginAndGetToken('hiring_manager_eng@ats.local')).token;
    interviewerToken = (await loginAndGetToken('interviewer1@ats.local')).token;
    approverToken = (await loginAndGetToken('approver@ats.local')).token;
    candidateToken = (await loginAndGetToken('candidate1@ats.local')).token;
  });

  describe('CANDIDATE Role Restrictions', () => {
    it('CAN view published jobs', async () => {
      const res = await request(app).get('/api/jobs').set(authHeader(candidateToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('CANNOT access recruitment requests (Requisitions) -> 403', async () => {
      const res = await request(app).get('/api/requisitions').set(authHeader(candidateToken));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('CANNOT access interview evaluations -> 403', async () => {
      const res = await request(app).get('/api/evaluations/eval-001').set(authHeader(candidateToken));
      expect(res.status).toBe(403);
    });

    it('CANNOT access user directory -> 403', async () => {
      const res = await request(app).get('/api/users').set(authHeader(candidateToken));
      expect(res.status).toBe(403);
    });

    it('CANNOT access audit logs -> 403', async () => {
      const res = await request(app).get('/api/audit-logs').set(authHeader(candidateToken));
      expect(res.status).toBe(403);
    });
  });

  describe('INTERVIEWER Role Restrictions', () => {
    it('CANNOT access recruitment requests (Requisitions) -> 403', async () => {
      const res = await request(app).get('/api/requisitions').set(authHeader(interviewerToken));
      expect(res.status).toBe(403);
    });

    it('CANNOT access job creation -> 403', async () => {
      const res = await request(app).post('/api/jobs').set(authHeader(interviewerToken)).send({
        title: 'Unauthorized Job',
        departmentId: 'dept-id',
        hiringManagerId: 'hm-id',
        description: 'Testing interviewer restriction',
      });
      expect(res.status).toBe(403);
    });

    it('CANNOT access offers -> 403', async () => {
      const res = await request(app).get('/api/offers').set(authHeader(interviewerToken));
      expect(res.status).toBe(403);
    });

    it('CANNOT access user management -> 403', async () => {
      const res = await request(app).get('/api/users').set(authHeader(interviewerToken));
      expect(res.status).toBe(403);
    });

    it('CAN view assigned evaluation (eval-001) -> 200', async () => {
      const res = await request(app).get('/api/evaluations/eval-001').set(authHeader(interviewerToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('eval-001');
    });
  });

  describe('HIRING_MANAGER Role Restrictions', () => {
    it('CAN view department requisitions', async () => {
      const res = await request(app).get('/api/requisitions').set(authHeader(hiringManagerToken));
      expect(res.status).toBe(200);
    });

    it('CANNOT view or manage user accounts -> 403', async () => {
      const res = await request(app).get('/api/users').set(authHeader(hiringManagerToken));
      expect(res.status).toBe(403);
    });

    it('CANNOT access system audit logs -> 403', async () => {
      const res = await request(app).get('/api/audit-logs').set(authHeader(hiringManagerToken));
      expect(res.status).toBe(403);
    });
  });

  describe('RECRUITER Role Restrictions', () => {
    it('CAN list and manage candidates', async () => {
      const res = await request(app).get('/api/candidates').set(authHeader(recruiterToken));
      expect(res.status).toBe(200);
    });

    it('CANNOT manage user accounts -> 403', async () => {
      const res = await request(app).get('/api/users').set(authHeader(recruiterToken));
      expect(res.status).toBe(403);
    });

    it('CANNOT access audit logs -> 403', async () => {
      const res = await request(app).get('/api/audit-logs').set(authHeader(recruiterToken));
      expect(res.status).toBe(403);
    });
  });

  describe('APPROVER Role Restrictions', () => {
    it('CAN view requisitions for approval', async () => {
      const res = await request(app).get('/api/requisitions').set(authHeader(approverToken));
      expect(res.status).toBe(200);
    });

    it('CANNOT manage user accounts -> 403', async () => {
      const res = await request(app).get('/api/users').set(authHeader(approverToken));
      expect(res.status).toBe(403);
    });

    it('CANNOT view system audit logs -> 403', async () => {
      const res = await request(app).get('/api/audit-logs').set(authHeader(approverToken));
      expect(res.status).toBe(403);
    });
  });

  describe('HR_MANAGER Role Capabilities & Boundaries', () => {
    it('CAN read users list -> 200', async () => {
      const res = await request(app).get('/api/users').set(authHeader(hrManagerToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('CAN read audit logs -> 200', async () => {
      const res = await request(app).get('/api/audit-logs').set(authHeader(hrManagerToken));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('CANNOT create internal users (Admin only) -> 403', async () => {
      const res = await request(app)
        .post('/api/users')
        .set(authHeader(hrManagerToken))
        .send({
          email: 'unauthorized-user@ats.local',
          password: 'Password123!',
          fullName: 'Unauthorized',
          roles: ['RECRUITER'],
        });
      expect(res.status).toBe(403);
    });
  });

  describe('ADMIN Role Full System Privileges', () => {
    it('CAN read user list -> 200', async () => {
      const res = await request(app).get('/api/users').set(authHeader(adminToken));
      expect(res.status).toBe(200);
    });

    it('CAN read audit logs -> 200', async () => {
      const res = await request(app).get('/api/audit-logs').set(authHeader(adminToken));
      expect(res.status).toBe(200);
    });

    it('CAN view candidates across all pipelines -> 200', async () => {
      const res = await request(app).get('/api/candidates').set(authHeader(adminToken));
      expect(res.status).toBe(200);
    });
  });
});
