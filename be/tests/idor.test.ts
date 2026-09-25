import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAndGetToken, authHeader } from './test-helper';

describe('5. Insecure Direct Object Reference (IDOR) Protection', () => {
  let candidate1Token: string;
  let candidate2Token: string;
  let interviewer2Token: string;

  beforeAll(async () => {
    candidate1Token = (await loginAndGetToken('candidate1@ats.local')).token;
    candidate2Token = (await loginAndGetToken('candidate2@ats.local')).token;
    interviewer2Token = (await loginAndGetToken('interviewer2@ats.local')).token;
  });

  it('Candidate 1 accessing own candidate profile (cand-001) -> 200', async () => {
    const res = await request(app)
      .get('/api/candidates/cand-001')
      .set(authHeader(candidate1Token));
    expect(res.status).toBe(200);
  });

  it('Candidate 1 tampering ID to access Candidate 2 (cand-002) is BLOCKED with 403', async () => {
    const res = await request(app)
      .get('/api/candidates/cand-002')
      .set(authHeader(candidate1Token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('Candidate 1 tampering ID to download Candidate 2 CV is BLOCKED with 403', async () => {
    const res = await request(app)
      .get('/api/candidates/cand-002/cv')
      .set(authHeader(candidate1Token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('Candidate 2 tampering ID to read Candidate 1 offer (offer-001) is BLOCKED with 403', async () => {
    const res = await request(app)
      .get('/api/offers/offer-001')
      .set(authHeader(candidate2Token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('Interviewer 2 tampering ID to view Interviewer 1 evaluation (eval-001) is BLOCKED with 403', async () => {
    const res = await request(app)
      .get('/api/evaluations/eval-001')
      .set(authHeader(interviewer2Token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
  });
});
