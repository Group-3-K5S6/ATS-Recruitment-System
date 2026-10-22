import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import request from 'supertest';

const sent = vi.hoisted(() => ({ tokens: [] as string[], notices: [] as string[] }));
vi.mock('../src/utils/email', async (importOriginal) => {
  const other = await importOriginal<typeof import('../src/utils/email')>();
  return {
    ...other,
    sendApplicationWithdrawalConfirmationEmail: vi.fn(async (
      _to: string, _name: string, _job: string, token: string
    ) => { sent.tokens.push(token); }),
    sendApplicationWithdrawalNoticeEmail: vi.fn(async (
      to: string
    ) => { sent.notices.push(to); }),
  };
});

import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

let trackingCode = '';
let email = '';
let applicationId = '';

beforeAll(async () => {
  const record = await prisma.application.findFirst({
    where: { status: 'ACTIVE', trackingCode: { not: null } },
    include: { candidate: true },
  });
  if (!record || !record.trackingCode) {
    throw new Error('SQLITE TEST chưa có hồ sơ ACTIVE với mã tra cứu. Không dùng MAIN để sửa.');
  }
  trackingCode = record.trackingCode;
  applicationId = record.id;
  email = (record.applicantEmailNormalized || record.candidate.email).trim().toLowerCase();
});

describe('S4-06: Rút hồ sơ có xác nhận email', () => {
  it('Email không khớp vẫn trả lời trung lập, không tạo token', async () => {
    const before = sent.tokens.length;
    const res = await request(app).post('/api/applications/withdrawal-requests')
      .send({ trackingCode, email: 'khongkhop@example.org' });
    expect(res.status).toBe(202);
    expect(sent.tokens.length).toBe(before);
  });

  it('Mã tra cứu sai vẫn trả lời trung lập', async () => {
    const res = await request(app).post('/api/applications/withdrawal-requests')
      .send({ trackingCode: 'ATS-KHONGTONTAI-123456', email });
    expect(res.status).toBe(202);
  });

  it('Thiếu thông tin bị từ chối', async () => {
    const res = await request(app).post('/api/applications/withdrawal-requests')
      .send({ email });
    expect(res.status).toBe(400);
  });

  it('Không có token hoặc token giả không mở được trang xác nhận', async () => {
    const res = await request(app).get('/api/applications/withdrawal-confirmation')
      .query({ token: 'f'.repeat(64) });
    expect(res.status).toBe(400);
  });

  it('Yêu cầu → email giả lập → xem trước → xác nhận → không thể sử dụng lại', async () => {
    const requestRes = await request(app).post('/api/applications/withdrawal-requests')
      .send({ trackingCode, email });
    expect(requestRes.status).toBe(202);
    const token = sent.tokens[sent.tokens.length - 1];
    expect(token).toBeTruthy();

    const preview = await request(app).get('/api/applications/withdrawal-confirmation')
      .query({ token });
    expect(preview.status).toBe(200);
    expect(preview.body.data.requiresConfirmation).toBe(true);
    expect(preview.body.data.candidateName).toBeTruthy();
    expect(preview.body.data.jobTitle).toBeTruthy();
    expect(preview.body.data.email).toBeUndefined();

    const confirmed = await request(app).post('/api/applications/withdrawal-confirmation')
      .send({ token });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('WITHDRAWN');

    const row = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(row?.status).toBe('WITHDRAWN');
    expect(row?.stage).toBe('WITHDRAWN');

    const tokenHash = createHash('sha256').update(token!).digest('hex');
    const record = await prisma.applicationWithdrawalToken.findUnique({ where: { tokenHash } });
    expect(record?.usedAt).not.toBeNull();

    const again = await request(app).post('/api/applications/withdrawal-confirmation')
      .send({ token });
    expect(again.status).toBe(400);

    const cannotPreview = await request(app).get('/api/applications/withdrawal-confirmation')
      .query({ token });
    expect(cannotPreview.status).toBe(400);
  });
});
