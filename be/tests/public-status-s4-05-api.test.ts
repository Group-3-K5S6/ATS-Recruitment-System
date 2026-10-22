import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { mapPublicStatus } from '../src/modules/candidates/public-status-s4-05';

let code = '';
let email = '';
let expectedStatus = '';

beforeAll(async () => {
  const record = await prisma.application.findFirst({
    include: {
      candidate: {
        select: { email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!record) {
    throw new Error('TEST_DB_THIEU_APPLICATION');
  }

  code = record.trackingCode ||
    `ATS-S405-${randomBytes(6).toString('hex').toUpperCase()}`;

  email = (
    record.applicantEmailNormalized ||
    record.candidate.email
  ).trim().toLowerCase();

  if (!email) {
    throw new Error('TEST_DB_THIEU_EMAIL');
  }

  if (!record.trackingCode) {
    await prisma.application.update({
      where: { id: record.id },
      data: { trackingCode: code }
    });
  }

  expectedStatus = mapPublicStatus(
    record.stage,
    record.status
  ).status;

  console.log('MA_TRA_CUU_TEST:', code);
  console.log('EMAIL_TRA_CUU_TEST:', email);
});

describe('S4-05: API tra cứu thực tế', () => {
  it('Tra cứu thành công không cần đăng nhập', async () => {
    const res = await request(app)
      .post('/api/candidates/track-status')
      .send({ trackingCode: code, email });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.trackingCode).toBe(code);
    expect(res.body.data.status).toBe(expectedStatus);
  });

  it('Không trả dữ liệu cá nhân hoặc nội bộ', async () => {
    const res = await request(app)
      .post('/api/candidates/track-status')
      .send({ trackingCode: code, email });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['trackingCode', 'status', 'statusLabel'].sort()
    );
  });

  it('Email sai bị từ chối', async () => {
    const res = await request(app)
      .post('/api/candidates/track-status')
      .send({
        trackingCode: code,
        email: 'khongtontai@example.com'
      });

    expect(res.status).toBe(404);
  });

  it('Mã hồ sơ sai bị từ chối', async () => {
    const res = await request(app)
      .post('/api/candidates/track-status')
      .send({
        trackingCode: 'ATS-KHONG-TON-TAI-987654',
        email
      });

    expect(res.status).toBe(404);
  });

  it('Email sai định dạng bị từ chối', async () => {
    const res = await request(app)
      .post('/api/candidates/track-status')
      .send({
        trackingCode: code,
        email: 'email-khong-hop-le'
      });

    expect(res.status).toBe(400);
  });

  it('Thiếu mã tra cứu bị từ chối', async () => {
    const res = await request(app)
      .post('/api/candidates/track-status')
      .send({ email });

    expect(res.status).toBe(400);
  });
});