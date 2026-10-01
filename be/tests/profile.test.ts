import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { loginAndGetToken, authHeader } from './test-helper';

describe('S2-02 Profile Management', () => {
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    // Assuming seed data has admin@ats.local with Password123!
    const loginRes = await loginAndGetToken('admin@ats.local', 'Password123!');
    userToken = loginRes.token;
    userId = loginRes.user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should get current user profile', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set(authHeader(userToken));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(userId);
    expect(res.body.data).toHaveProperty('phone');
    expect(res.body.data).toHaveProperty('avatarUrl');
  });

  it('should update profile with valid data', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set(authHeader(userToken))
      .send({
        fullName: 'New Admin Name',
        phone: '0987654321',
        avatarUrl: 'https://example.com/avatar.jpg'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('New Admin Name');
    expect(res.body.data.phone).toBe('0987654321');
    expect(res.body.data.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  it('should reject invalid phone format', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set(authHeader(userToken))
      .send({
        phone: '12345'
      });

    expect(res.status).toBe(400);
  });

  it('should ignore restricted fields like email and roles', async () => {
    const originalRes = await request(app)
      .get('/api/users/me')
      .set(authHeader(userToken));
    
    const originalEmail = originalRes.body.data.email;

    const res = await request(app)
      .put('/api/users/me')
      .set(authHeader(userToken))
      .send({
        email: 'hacker@hacker.com',
        roles: ['SOME_FAKE_ROLE']
      });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(originalEmail); 
    expect(res.body.data.email).not.toBe('hacker@hacker.com');
  });
});
