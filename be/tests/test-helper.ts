import request from 'supertest';
import { app } from '../src/app';

export async function loginAndGetToken(
  email: string,
  password = 'Password123!'
): Promise<{ token: string; user: any }> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(`Failed to login ${email}: ${JSON.stringify(res.body)}`);
  }

  return {
    token: res.body.data.accessToken,
    user: res.body.data.user,
  };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
