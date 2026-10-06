import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAndGetToken, authHeader } from './test-helper';

describe('7. Audit Logging Trail & Access Verification', () => {
  let adminToken: string;
  let candidateToken: string;

  beforeAll(async () => {
    adminToken = (await loginAndGetToken('admin@ats.local')).token;
    candidateToken = (await loginAndGetToken('candidate1@ats.local')).token;
  });

  it('Candidate CANNOT access audit logs -> 403', async () => {
    const res = await request(app)
      .get('/api/audit-logs')
      .set(authHeader(candidateToken));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
  });

  it('Admin CAN access audit logs and view chronological events -> 200', async () => {
    const res = await request(app)
      .get('/api/audit-logs')
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const firstLog = res.body.data[0];
    expect(firstLog).toHaveProperty('action');
    expect(firstLog).toHaveProperty('resourceType');
    expect(firstLog).toHaveProperty('createdAt');
  });

  it('Actions performed by users trigger corresponding audit log entries', async () => {
    // 1. Create a candidate as Admin
    const createRes = await request(app)
      .post('/api/candidates')
      .set(authHeader(adminToken))
      .send({
        fullName: 'Audit Log Test Candidate',
        email: `audit-test-${Date.now()}@test.internal`,
      });

    expect(createRes.status).toBe(201);
    const candidateId = createRes.body.data.id;

    // 2. Query audit logs for CANDIDATE_CREATED action
    const auditRes = await request(app)
      .get(`/api/audit-logs?action=CANDIDATE_CREATED&resourceType=candidate`)
      .set(authHeader(adminToken));

    expect(auditRes.status).toBe(200);
    const matchedLog = auditRes.body.data.find(
      (log: any) => log.resourceId === candidateId
    );
    expect(matchedLog).toBeDefined();
    expect(matchedLog.action).toBe('CANDIDATE_CREATED');
  });
});
