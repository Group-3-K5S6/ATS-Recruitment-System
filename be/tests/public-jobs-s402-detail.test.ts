import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('S4-02: Chi tiet tin tuyen dung cong khai', () => {
  const uid = randomUUID();
  let departmentId = '';
  let userId = '';
  let requisitionId = '';
  const jobIds: string[] = [];
  let previousProfile: Awaited<ReturnType<typeof prisma.companyProfile.findUnique>> = null;

  let activeId = '';
  let expiredId = '';
  let closedId = '';
  let draftId = '';
  let approvedOnlyId = '';
  let noApprovalId = '';

  beforeAll(async () => {
    // Hard stop: no test case may run against the main ATS database.
    if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL !== 'file:./ats.db') {
      throw new Error('S4-02 tests require NODE_ENV=test and DATABASE_URL=file:./ats.db');
    }

    const dept = await prisma.department.create({
      data: { name: 'S4-02 isolated testing', code: `S402_${uid.slice(0, 12)}` },
    });
    departmentId = dept.id;
    const user = await prisma.user.create({
      data: { email: `s402-${uid}@test.local`, fullName: 'S4-02 Test Account', passwordHash: 'not-a-real-password' },
    });
    userId = user.id;
    const requisition = await prisma.requisition.create({
      data: {
        title: 'S4-02 test requisition',
        departmentId,
        hiringManagerId: userId,
        requirements: 'Yeu cau: co kinh nghiem React va TypeScript',
      },
    });
    requisitionId = requisition.id;

    previousProfile = await prisma.companyProfile.findUnique({ where: { id: 'default' } });
    await prisma.companyProfile.upsert({
      where: { id: 'default' },
      create: { id: 'default', companyName: 'S4-02 Test Company', tagline: 'Tuyen dung', benefits: 'Quyen loi kiem thu S4-02', isPublished: true },
      update: { companyName: 'S4-02 Test Company', tagline: 'Tuyen dung', benefits: 'Quyen loi kiem thu S4-02', isPublished: true },
    });

    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const base = {
      departmentId,
      hiringManagerId: userId,
      description: 'Mo ta cong viec S4-02',
      location: 'Ha Noi',
      workMode: 'HYBRID',
      requisitionId,
    };
    async function addJob(status: string, title: string, opts: { approvedAt?: Date | null; publishedAt?: Date | null; applicationDeadline?: Date | null } = {}) {
      const created = await prisma.job.create({ data: {
        ...base, title, status,
        approvedAt: opts.approvedAt === undefined ? now : opts.approvedAt,
        publishedAt: opts.publishedAt === undefined ? now : opts.publishedAt,
        applicationDeadline: opts.applicationDeadline === undefined ? future : opts.applicationDeadline,
      }});
      jobIds.push(created.id);
      return created.id;
    }
    activeId = await addJob('PUBLISHED', 'S402 Active Job');
    expiredId = await addJob('PUBLISHED', 'S402 Expired Job', { applicationDeadline: past });
    closedId = await addJob('CLOSED', 'S402 Closed Job');
    draftId = await addJob('DRAFT', 'S402 Draft Job', { approvedAt: null, publishedAt: null });
    approvedOnlyId = await addJob('APPROVED', 'S402 Approved Only', { publishedAt: null });
    noApprovalId = await addJob('PUBLISHED', 'S402 Unapproved Publication', { approvedAt: null });
  });

  afterAll(async () => {
    if (jobIds.length) await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    if (requisitionId) await prisma.requisition.delete({ where: { id: requisitionId } });
    if (departmentId) await prisma.department.delete({ where: { id: departmentId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (previousProfile) {
      await prisma.companyProfile.update({ where: { id: 'default' }, data: {
        companyName: previousProfile.companyName,
        tagline: previousProfile.tagline,
        introduction: previousProfile.introduction,
        culture: previousProfile.culture,
        benefits: previousProfile.benefits,
        website: previousProfile.website,
        contactEmail: previousProfile.contactEmail,
        location: previousProfile.location,
        isPublished: previousProfile.isPublished,
        logoData: previousProfile.logoData,
        bannerData: previousProfile.bannerData,
      }});
    } else {
      await prisma.companyProfile.deleteMany({ where: { id: 'default', companyName: 'S4-02 Test Company' } });
    }
  });

  it('AC1: khong can dang nhap, tra mo ta, yeu cau, quyen loi, han nop', async () => {
    const res = await request(app).get(`/api/public/jobs/${activeId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.job.description).toBe('Mo ta cong viec S4-02');
    expect(res.body.data.job.requisition.requirements).toContain('React');
    expect(res.body.data.job.applicationDeadline).toBeTruthy();
    expect(res.body.data.companyProfile.benefits).toBe('Quyen loi kiem thu S4-02');
    expect(res.body.data.job.isExpired).toBe(false);
  });

  it('AC3: tin qua han van xem duoc chi tiet va co isExpired=true', async () => {
    const res = await request(app).get(`/api/public/jobs/${expiredId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.job.isExpired).toBe(true);
  });

  it('AC3: tin CLOSED van xem duoc chi tiet nhung khong nhan ho so', async () => {
    const res = await request(app).get(`/api/public/jobs/${closedId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('CLOSED');
    expect(res.body.data.job.isExpired).toBe(true);
  });

  it('Bao mat: tin DRAFT phai bi an cong khai', async () => {
    const res = await request(app).get(`/api/public/jobs/${draftId}`);
    expect(res.status).toBe(404);
  });

  it('Bao mat: tin APPROVED chua xuat ban phai bi an', async () => {
    const res = await request(app).get(`/api/public/jobs/${approvedOnlyId}`);
    expect(res.status).toBe(404);
  });

  it('Nhat quan S4-01: tin PUBLISHED khong co approvedAt phai bi an', async () => {
    const res = await request(app).get(`/api/public/jobs/${noApprovalId}`);
    expect(res.status).toBe(404);
  });

  it('Bao mat: API chi tiet khong lo thong tin phe duyet noi bo', async () => {
    const res = await request(app).get(`/api/public/jobs/${activeId}`);
    expect(res.status).toBe(200);
    const job = res.body.data.job;
    for (const key of ['approvedById', 'publishedById', 'approvalNotes', 'rejectionReason']) {
      expect(job).not.toHaveProperty(key);
    }
  });

  it('Khong mo API nop ho so S4-03 qua route cong khai', async () => {
    const before = await prisma.application.count({ where: { jobId: activeId } });
    const res = await request(app).post(`/api/jobs/public/${activeId}/apply`).send({
      fullName: 'Should Not Apply', email: 'never@applied.local',
    });
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
    const after = await prisma.application.count({ where: { jobId: activeId } });
    expect(after).toBe(before);
  });
});
