import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAndGetToken, authHeader } from './test-helper';

describe('4. Privilege Escalation Prevention', () => {
  let candidateToken: string;
  let candidateId: string;
  let recruiterToken: string;

  beforeAll(async () => {
    const cand = await loginAndGetToken('candidate1@ats.local');
    candidateToken = cand.token;
    candidateId = cand.user.id;

    const rec = await loginAndGetToken('recruiter1@ats.local');
    recruiterToken = rec.token;
  });

  it('Candidate CANNOT elevate themselves to ADMIN role via role assignment API', async () => {
    const res = await request(app)
      .put(`/api/users/${candidateId}/roles`)
      .set(authHeader(candidateToken))
      .send({ roles: ['ADMIN'] });

    expect(res.status).toBe(403);
  });

  it('Recruiter CANNOT grant permissions or change roles of any user', async () => {
    const res = await request(app)
      .put(`/api/users/${candidateId}/roles`)
      .set(authHeader(recruiterToken))
      .send({ roles: ['ADMIN'] });

    expect(res.status).toBe(403);
  });

  it('Candidate cannot forge userId in request body to create candidate under another user account', async () => {
    const res = await request(app)
      .post('/api/candidates')
      .set(authHeader(candidateToken))
      .send({
        fullName: 'Spoofed Identity',
        email: 'spoofed@evil.com',
        userId: 'admin-target-user-id',
      });

    expect([200, 201]).toContain(res.status);
    // Server must enforce candidate.userId = authenticated candidate's ID, not spoofed body
    expect(res.body.data.userId).toBe(candidateId);
  });

  it('Non-admin user CANNOT disable other accounts', async () => {
    const res = await request(app)
      .patch(`/api/users/${candidateId}/disable`)
      .set(authHeader(recruiterToken));

    expect(res.status).toBe(403);
  });
});
