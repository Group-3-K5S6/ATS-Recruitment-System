/**
 * Sprint 1-2 regression checks.
 * Run only with an isolated, seeded test database. These tests write test data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { loginAndGetToken, authHeader } from './test-helper';

const ids: string[] = [];
const categoryIds: string[] = [];
let recruiterToken = '';
let approverToken = '';
let hrToken = '';
let hiringToken = '';

beforeAll(async () => {
  [recruiterToken, approverToken, hrToken, hiringToken] = await Promise.all([
    loginAndGetToken('recruiter1@ats.local').then(x => x.token),
    loginAndGetToken('approver@ats.local').then(x => x.token),
    loginAndGetToken('hr_manager@ats.local').then(x => x.token),
    loginAndGetToken('hiring_manager_eng@ats.local').then(x => x.token),
  ]);
});

afterAll(async () => {
  if (categoryIds.length) {
    await prisma.recruitmentCategory.deleteMany({ where: { id: { in: categoryIds } } });
  }
  if (ids.length) {
    await prisma.requisition.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

describe('S1-05 - Phân quyền tài nguyên', () => {
  it('Recruiter không thể sửa hay đăng tin thuộc Recruiter khác', async () => {
    const update = await request(app).put('/api/jobs/job-mkt-001')
      .set(authHeader(recruiterToken)).send({ title: 'Không được sửa' });
    expect(update.status).toBe(403);
    const publish = await request(app).post('/api/jobs/job-mkt-001/publish')
      .set(authHeader(recruiterToken));
    expect(publish.status).toBe(403);
  });

  it('Approver chỉ thấy yêu cầu được giao, không lộ yêu cầu chưa phân công', async () => {
    const hr = await prisma.user.findUnique({ where: { email: 'hiring_manager_eng@ats.local' } });
    const department = await prisma.department.findUnique({ where: { code: 'ENG' } });
    expect(hr).not.toBeNull(); expect(department).not.toBeNull();
    const id = randomUUID();
    await prisma.requisition.create({
      data: { id, title: 'Yêu cầu chưa phân công duyệt', departmentId: department!.id,
        hiringManagerId: hr!.id, status: 'DRAFT', headcount: 1 },
    });
    ids.push(id);
    const list = await request(app).get('/api/requisitions').set(authHeader(approverToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((value: { id: string }) => value.id === id)).toBe(false);
    const detail = await request(app).get(`/api/requisitions/${id}`).set(authHeader(approverToken));
    expect(detail.status).toBe(403);
  });
});

describe('S2-08 - Danh mục dùng chung', () => {
  it('HR Manager tạo, đọc, xóa danh mục được lưu thật', async () => {
    const name = `Nguồn kiểm thử ${randomUUID()}`;
    const created = await request(app).post('/api/shared-categories')
      .set(authHeader(hrToken)).send({ category: 'nguonUngVien', name });
    expect(created.status).toBe(201);
    const id: string = created.body.data.id;
    categoryIds.push(id);
    const list = await request(app).get('/api/shared-categories').set(authHeader(hrToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((item: { id: string }) => item.id === id)).toBe(true);
    const removed = await request(app).delete(`/api/shared-categories/${id}`).set(authHeader(hrToken));
    expect(removed.status).toBe(200);
    categoryIds.splice(categoryIds.indexOf(id), 1);
  });
});

describe('S2-10 - Yêu cầu tuyển dụng', () => {
  it('Hiring Manager lưu nháp vào phòng ban của mình', async () => {
    const dept = await prisma.department.findUnique({ where: { code: 'ENG' } });
    const title = await prisma.jobTitle.findUnique({ where: { code: 'IT-BE-03' } });
    expect(dept).not.toBeNull(); expect(title).not.toBeNull();
    const response = await request(app).post('/api/requisitions')
      .set(authHeader(hiringToken))
      .send({ departmentId: dept!.id, jobTitleId: title!.id, headcount: 1,
        isDraft: true, reason: 'NEW' });
    expect(response.status).toBe(201);
    ids.push(response.body.data.id);
    expect(response.body.data.status).toBe('DRAFT');
  });
});
