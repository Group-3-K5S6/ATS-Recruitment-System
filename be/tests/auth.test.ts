import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { loginAndGetToken, authHeader } from './test-helper';
import { prisma } from '../src/database/prisma';
import { sentEmailsLog } from '../src/utils/email';
import { hashToken } from '../src/utils/token';


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

  describe('3. Forgot & Reset Password via Email (SCRUM-51)', () => {
    it('displays identical message for non-existent email as existing email (Criteria 3)', async () => {
      const nonExistantEmail = `nonexistent_${Date.now()}@ats.local`;

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: nonExistantEmail });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe(
        'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi một liên kết đặt lại mật khẩu. Liên kết có hiệu lực trong 30 phút.'
      );
    });

    it('generates reset token valid for 30 minutes and dispatches reset email (Criteria 1 & 3)', async () => {
      const email = `reset_test_${Date.now()}@ats.local`;
      const password = 'Password123!';

      // Register test candidate
      await request(app)
        .post('/api/auth/register')
        .send({ email, password, fullName: 'Reset Tester' });

      // Request forgot password
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email });

      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.data.message).toBe(
        'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi một liên kết đặt lại mật khẩu. Liên kết có hiệu lực trong 30 phút.'
      );

      // Verify token record in database
      const dbToken = await prisma.passwordResetToken.findFirst({
        where: { email },
        orderBy: { createdAt: 'desc' },
      });

      expect(dbToken).toBeDefined();
      expect(dbToken?.usedAt).toBeNull();

      // Expiry should be ~30 minutes in future (e.g. 29-30 mins)
      const now = Date.now();
      const diffMinutes = (dbToken!.expiresAt.getTime() - now) / (1000 * 60);
      expect(diffMinutes).toBeGreaterThan(28);
      expect(diffMinutes).toBeLessThanOrEqual(30.1);

      // Verify email log entry
      const sentEmail = sentEmailsLog.find((e) => e.email === email);
      expect(sentEmail).toBeDefined();
      expect(sentEmail?.resetLink).toContain('/reset-password?token=');
    });

    it('resets password successfully and prevents token reuse (Criteria 1 & 2)', async () => {
      const email = `reset_reuse_${Date.now()}@ats.local`;
      const origPassword = 'Password123!';
      const newPassword = 'NewResetPassword123!';

      // 1. Register user
      await request(app)
        .post('/api/auth/register')
        .send({ email, password: origPassword, fullName: 'Reuse Tester' });

      // 2. Forgot password request
      sentEmailsLog.length = 0; // clear log
      await request(app).post('/api/auth/forgot-password').send({ email });

      const emailEntry = sentEmailsLog.find((e) => e.email === email);
      expect(emailEntry).toBeDefined();
      const rawToken = new URL(emailEntry!.resetLink).searchParams.get('token');
      expect(rawToken).toBeTruthy();

      // 3. Reset password using valid raw token
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          newPassword,
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.message).toContain('Đặt lại mật khẩu thành công');

      // 4. Verification: Old password fails login
      const oldLogin = await request(app).post('/api/auth/login').send({ email, password: origPassword });
      expect(oldLogin.status).toBe(401);

      // 5. Verification: New password succeeds login
      const newLogin = await request(app).post('/api/auth/login').send({ email, password: newPassword });
      expect(newLogin.status).toBe(200);

      // 6. Criteria 2: Single-use check — reusing the same token must fail
      const secondResetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'AnotherPassword123!',
        });

      expect(secondResetRes.status).toBe(400);
      expect(secondResetRes.body.error.code).toBe('TOKEN_ALREADY_USED');
    });

    it('rejects password reset when token is expired (Criteria 1)', async () => {
      const email = `expired_token_${Date.now()}@ats.local`;
      const expiredRawToken = `expired-raw-token-${Date.now()}`;
      const tokenHash = hashToken(expiredRawToken);

      // Create an expired token record (expired 10 minutes ago)
      await prisma.passwordResetToken.create({
        data: {
          email,
          tokenHash,
          expiresAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: expiredRawToken,
          newPassword: 'NewPassword123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPIRED_TOKEN');
      expect(res.body.error.message).toContain('hiệu lực trong 30 phút');
    });

    it('rejects password reset when new password matches current password or fails policy', async () => {
      const email = `policy_test_${Date.now()}@ats.local`;
      const origPassword = 'Password123!';

      await request(app)
        .post('/api/auth/register')
        .send({ email, password: origPassword, fullName: 'Policy Tester' });

      sentEmailsLog.length = 0;
      await request(app).post('/api/auth/forgot-password').send({ email });

      const emailEntry = sentEmailsLog.find((e) => e.email === email);
      const rawToken = new URL(emailEntry!.resetLink).searchParams.get('token');

      // Fails complexity policy
      const weakRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'weak',
        });
      expect(weakRes.status).toBe(400);
      expect(weakRes.body.error.code).toBe('VALIDATION_ERROR');

      // Reuses current password
      const sameRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: origPassword,
        });
      expect(sameRes.status).toBe(400);
      expect(sameRes.body.error.code).toBe('PASSWORD_REUSED');
    });
  });
});

