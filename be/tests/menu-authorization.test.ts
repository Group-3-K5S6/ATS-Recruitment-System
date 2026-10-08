import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAndGetToken, authHeader } from './test-helper';

describe('5. Role-Based Navigation Menu & Authorization API (GET /api/auth/me/menu)', () => {
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

  describe('Authentication & Middleware Protection', () => {
    it('rejects unauthenticated request with 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me/menu');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects request with 401 when token is invalid', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set('Authorization', 'Bearer invalid.jwt.token');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('supports alias endpoint GET /api/menu with same security controls', async () => {
      const res = await request(app)
        .get('/api/menu')
        .set(authHeader(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('ADMIN Role Menu Retrieval', () => {
    it('returns all permitted internal menus for ADMIN', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data;
      const keys = items.map((i: any) => i.key);

      // Verify all 10 ATS internal functional modules are present
      expect(keys).toEqual([
        'dashboard',
        'requisitions',
        'jobs',
        'candidates',
        'interviews',
        'evaluations',
        'offers',
        'reports',
        'users',
        'audit-logs',
        'departments',
'competency-frameworks',
'company-profile',
'company-config',
      ]);

      // Admin must NOT see candidate-specific portal links
      expect(keys).not.toContain('my-applications');
      expect(keys).not.toContain('my-interviews');
      expect(keys).not.toContain('my-offers');

      // Verify sub-menus under users
      const usersMenu = items.find((i: any) => i.key === 'users');
      expect(usersMenu.children.map((c: any) => c.key)).toEqual([
        'user-list',
        'role-management',
      ]);
    });
  });

  describe('HR_MANAGER Role Menu Retrieval', () => {
    it('returns all 10 internal HR modules for HR_MANAGER', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data;
      const keys = items.map((i: any) => i.key);

      expect(keys).toEqual([
        'dashboard',
        'requisitions',
        'jobs',
        'candidates',
        'interviews',
        'evaluations',
        'offers',
        'reports',
        'users',
        'audit-logs',
        'departments',
'job-titles',
'competency-frameworks',
'interview-question-bank',
'recruitment-shared-categories',
'company-profile',
      ]);

      // HR Manager can view audit-logs and users
      expect(keys).toContain('audit-logs');
      expect(keys).toContain('users');
    });
  });

  describe('RECRUITER Role Menu Retrieval', () => {
    it('returns only permitted recruitment menus and excludes users & audit-logs', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data;
      const keys = items.map((i: any) => i.key);

      expect(keys).toEqual([
        'dashboard',
        'requisitions',
        'jobs',
        'candidates',
        'interviews',
        'evaluations',
        'offers',
        'reports',
      ]);

      // Recruiter must NEVER see users or audit-logs
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('audit-logs');

      // Recruiter has full job actions
      const jobsMenu = items.find((i: any) => i.key === 'jobs');
      expect(jobsMenu.children.map((c: any) => c.key)).toContain('create-job');
    });
  });

  describe('HIRING_MANAGER Role Menu Retrieval', () => {
    it('returns departmental recruitment menus and excludes restricted actions', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set(authHeader(hiringManagerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data;
      const keys = items.map((i: any) => i.key);

      expect(keys).toEqual([
        'dashboard',
        'requisitions',
        'jobs',
        'candidates',
        'interviews',
        'evaluations',
        'offers',
        'reports',
      ]);

      // Hiring Manager does not have users or audit logs
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('audit-logs');

      // Hiring Manager CAN create requisition for department
      const reqMenu = items.find((i: any) => i.key === 'requisitions');
      expect(reqMenu.children.map((c: any) => c.key)).toContain('create-requisition');

      // Hiring Manager CANNOT create job postings (only view)
      const jobsMenu = items.find((i: any) => i.key === 'jobs');
      expect(jobsMenu.children.map((c: any) => c.key)).toEqual(['all-jobs']);
      expect(jobsMenu.children.map((c: any) => c.key)).not.toContain('create-job');
    });
  });

  describe('INTERVIEWER Role Menu Retrieval', () => {
    it('strictly returns ONLY interviews and evaluations for INTERVIEWER', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set(authHeader(interviewerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data;
      const keys = items.map((i: any) => i.key);

      // Strictly limited to interview & evaluation
      expect(keys).toEqual(['interviews', 'evaluations']);

      // Forbidden menus
      expect(keys).not.toContain('dashboard');
      expect(keys).not.toContain('requisitions');
      expect(keys).not.toContain('jobs');
      expect(keys).not.toContain('candidates');
      expect(keys).not.toContain('offers');
      expect(keys).not.toContain('reports');
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('audit-logs');

      // Interviewer can only view assigned interviews, not schedule new ones
      const interviewsMenu = items.find((i: any) => i.key === 'interviews');
      expect(interviewsMenu.children.map((c: any) => c.key)).toEqual(['all-interviews']);
      expect(interviewsMenu.children.map((c: any) => c.key)).not.toContain('create-interview');
    });
  });

  describe('APPROVER Role Menu Retrieval', () => {
    it('returns approval & offer related menus and excludes interviews, users, audit-logs', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set(authHeader(approverToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data;
      const keys = items.map((i: any) => i.key);

      expect(keys).toEqual([
        'dashboard',
        'requisitions',
        'jobs',
        'candidates',
        'evaluations',
        'offers',
        'reports',
      ]);

      // Approver does NOT have interviews, users, or audit logs
      expect(keys).not.toContain('interviews');
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('audit-logs');

      // Approver can review requisitions but not create new ones
      const reqMenu = items.find((i: any) => i.key === 'requisitions');
      expect(reqMenu.children.map((c: any) => c.key)).toEqual(['all-requisitions']);
      expect(reqMenu.children.map((c: any) => c.key)).not.toContain('create-requisition');
    });
  });

  describe('CANDIDATE Role Menu Retrieval', () => {
    it('returns ONLY candidate portal navigation and NO internal employee menus', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set(authHeader(candidateToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data;
      const keys = items.map((i: any) => i.key);

      expect(keys).toEqual([
        'candidate-jobs',
        'my-applications',
        'my-interviews',
        'my-offers',
      ]);

      // Candidate must NEVER see internal management menus
      expect(keys).not.toContain('dashboard');
      expect(keys).not.toContain('requisitions');
      expect(keys).not.toContain('candidates');
      expect(keys).not.toContain('evaluations');
      expect(keys).not.toContain('reports');
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('audit-logs');
    });
  });

  describe('Security & Privilege Escalation Prevention', () => {
    it('does NOT trust role passed via query parameter (GET ?role=ADMIN)', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu?role=ADMIN')
        .set(authHeader(candidateToken));

      expect(res.status).toBe(200);
      const keys = res.body.data.map((i: any) => i.key);
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('audit-logs');
      expect(keys).not.toContain('dashboard');
      expect(keys).toContain('my-applications');
    });

    it('does NOT trust role passed via request body ({ role: "ADMIN" })', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set(authHeader(recruiterToken))
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(200);
      const keys = res.body.data.map((i: any) => i.key);
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('audit-logs');
    });

    it('does NOT trust custom spoofing headers (X-User-Role: ADMIN)', async () => {
      const res = await request(app)
        .get('/api/auth/me/menu')
        .set(authHeader(interviewerToken))
        .set('X-User-Role', 'ADMIN');

      expect(res.status).toBe(200);
      const keys = res.body.data.map((i: any) => i.key);
      expect(keys).toEqual(['interviews', 'evaluations']);
    });
  });

  describe('Authorization Independence (Menu Filtering != Authorization)', () => {
    it('returns 403 when RECRUITER calls /api/users directly despite menu hiding it', async () => {
      const res = await request(app)
        .get('/api/users')
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('returns 403 when INTERVIEWER calls /api/requisitions directly', async () => {
      const res = await request(app)
        .get('/api/requisitions')
        .set(authHeader(interviewerToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('returns 403 when CANDIDATE calls /api/audit-logs directly', async () => {
      const res = await request(app)
        .get('/api/audit-logs')
        .set(authHeader(candidateToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });
  });
});
