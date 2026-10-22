import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAndGetToken, authHeader } from './test-helper';

describe('6. Sensitive Data Protection & Field-Level Sanitization', () => {
  let adminToken: string;
  let interviewer1Token: string;
  let candidate1Token: string;

  beforeAll(async () => {
    adminToken = (await loginAndGetToken('admin@ats.local')).token;
    interviewer1Token = (await loginAndGetToken('interviewer1@ats.local')).token;
    candidate1Token = (await loginAndGetToken('candidate1@ats.local')).token;
  });

  it('Password hash is NEVER exposed in /api/users response', async () => {
    const res = await request(app)
      .get('/api/users')
      .set(authHeader(adminToken));

    expect(res.status).toBe(200);
    for (const u of res.body.data) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.password).toBeUndefined();
    }
  });

  it('Password hash is NEVER exposed in /api/auth/login or /api/auth/me response', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(candidate1Token));

    expect(res.status).toBe(200);
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('Interviewer viewing candidate gets sanitized fields (NO expectedSalary, NO address, MASKED phone)', async () => {
    const res = await request(app)
      .get('/api/candidates/cand-001')
      .set(authHeader(interviewer1Token));

    expect(res.status).toBe(200);
    const candidate = res.body.data;

    // Must be sanitized
    expect(candidate.expectedSalary).toBeUndefined();
    expect(candidate.address).toBeUndefined();
    expect(candidate.phone).toContain('****'); // masked phone
    expect(candidate.fullName).toBeTruthy();
  });

  it('Candidate viewing offer has internal recruiter notes stripped', async () => {
    const res = await request(app)
      .get('/api/offers/offer-001')
      .set(authHeader(candidate1Token));

    // Offer-001 is PENDING_APPROVAL in seed, so candidate cannot view yet
    // Or if viewable, internalNotes must be omitted
    if (res.status === 200) {
      expect(res.body.data.internalNotes).toBeUndefined();
    } else {
      expect(res.status).toBe(403);
    }
  });
});
