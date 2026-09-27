import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { loginAndGetToken, authHeader } from './test-helper';

describe('1. Authentication & Token Revocation Security', () => {
  let candidateToken: string;

  beforeAll(async () => {
    const auth = await loginAndGetToken('candidate1@ats.local');
    candidateToken = auth.token;
  });

  it('rejects request with 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/api/candidates');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects request with 401 when token is invalid or corrupted', async () => {
    const res = await request(app)
      .get('/api/candidates')
      .set('Authorization', 'Bearer invalid.token.payload');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects request with 401 when token is signed with wrong secret', async () => {
    const fakeToken = jwt.sign({ userId: 'fake-id', email: 'fake@ats.local' }, 'wrong-secret-key', {
      expiresIn: '1h',
    });
    const res = await request(app)
      .get('/api/candidates')
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects request with 401 when token is expired', async () => {
    const expiredToken = jwt.sign({ userId: 'fake-id', email: 'fake@ats.local' }, env.JWT_SECRET, {
      expiresIn: '-10s',
    });
    const res = await request(app)
      .get('/api/candidates')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('allows access with valid JWT token on /api/auth/me', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(candidateToken));
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('candidate1@ats.local');
    expect(res.body.data.roles).toContain('CANDIDATE');
  });

  it('revokes token on logout and denies subsequent access with 401', async () => {
    // 1. Login to get a dedicated token
    const { token } = await loginAndGetToken('candidate2@ats.local');

    // 2. Token works
    const check1 = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));
    expect(check1.status).toBe(200);

    // 3. Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set(authHeader(token));
    expect(logoutRes.status).toBe(200);

    // 4. Token is now revoked
    const check2 = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));
    expect(check2.status).toBe(401);
    expect(check2.body.error.code).toBe('TOKEN_REVOKED');
  });
});
