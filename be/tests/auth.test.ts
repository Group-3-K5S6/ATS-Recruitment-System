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

  describe('2. Change Password API Security & Session Revocation', () => {
    it('rejects change password request when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword123!',
        });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects change password when current password is incorrect', async () => {
      const { token } = await loginAndGetToken('recruiter1@ats.local');
      const res = await request(app)
        .post('/api/auth/change-password')
        .set(authHeader(token))
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    });

    it('rejects change password when new password fails complexity policy', async () => {
      const { token } = await loginAndGetToken('recruiter1@ats.local');
      const res = await request(app)
        .post('/api/auth/change-password')
        .set(authHeader(token))
        .send({
          currentPassword: 'Password123!',
          newPassword: 'short',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects change password when new password is identical to current password', async () => {
      const { token } = await loginAndGetToken('recruiter1@ats.local');
      const res = await request(app)
        .post('/api/auth/change-password')
        .set(authHeader(token))
        .send({
          currentPassword: 'Password123!',
          newPassword: 'Password123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PASSWORD_REUSED');
    });

    it('successfully updates password, revokes token, enforces history, and allows login with new password', async () => {
      const email = `test_cp_${Date.now()}@ats.local`;
      const origPassword = 'Password123!';
      const newPassword = 'NewPassword123!';

      // Register test user
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: origPassword,
          fullName: 'Test CP User',
        });
      expect(regRes.status).toBe(201);

      // 1. Login to get token
      const loginRes1 = await request(app)
        .post('/api/auth/login')
        .send({ email, password: origPassword });
      expect(loginRes1.status).toBe(200);
      const token = loginRes1.body.data.accessToken;

      // 2. Change password to newPassword
      const changeRes = await request(app)
        .post('/api/auth/change-password')
        .set(authHeader(token))
        .send({
          currentPassword: origPassword,
          newPassword,
        });
      expect(changeRes.status).toBe(200);
      expect(changeRes.body.data.message).toContain('Đổi mật khẩu thành công');

      // 3. Old token should now be revoked
      const checkToken = await request(app)
        .get('/api/auth/me')
        .set(authHeader(token));
      expect(checkToken.status).toBe(401);
      expect(checkToken.body.error.code).toBe('TOKEN_REVOKED');

      // 4. Login with old password should fail
      const failedLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password: origPassword,
        });
      expect(failedLogin.status).toBe(401);

      // 5. Login with new password should succeed
      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password: newPassword,
        });
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.data.accessToken).toBeDefined();

      const newToken = newLogin.body.data.accessToken;

      // 6. Attempting to reuse old password should fail
      const reuseRes = await request(app)
        .post('/api/auth/change-password')
        .set(authHeader(newToken))
        .send({
          currentPassword: newPassword,
          newPassword: origPassword,
        });
      expect(reuseRes.status).toBe(400);
      expect(reuseRes.body.error.code).toBe('PASSWORD_REUSED');
    });
  });
});
