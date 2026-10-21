import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { loginAndGetToken, authHeader } from './test-helper';

/**
 * SCRUM-30 / SCRUM-107: Kiểm thử tính năng Ứng viên xem chi tiết tin tuyển dụng & Nộp hồ sơ
 * 
 * Tiêu chí nghiệm thu:
 * - Hiển thị mô tả công việc, yêu cầu, quyền lợi, hạn nộp
 * - Có nút ứng tuyển nổi bật, hiển thị tốt trên điện thoại
 * - Tin đã hết hạn hiển thị thông báo thay vì biểu mẫu ứng tuyển
 */
describe('SCRUM-30 / SCRUM-107: Ứng viên xem chi tiết tin tuyển dụng', () => {
  let candidateToken = '';
  let candidateUser: any;
  let hrToken = '';
  let hrUser: any;
  let recruiterToken = '';
  let recruiterUser: any;

  let engDept: any;
  let jobTitle: any;
  let testRequisition: any;

  const createdJobIds: string[] = [];
  const createdReqIds: string[] = [];
  const createdCandIds: string[] = [];

  beforeAll(async () => {
    const [candRes, hrRes, recRes] = await Promise.all([
      loginAndGetToken('candidate1@ats.local'),
      loginAndGetToken('hr_manager@ats.local'),
      loginAndGetToken('recruiter1@ats.local'),
    ]);

    candidateToken = candRes.token;
    candidateUser = candRes.user;
    hrToken = hrRes.token;
    hrUser = hrRes.user;
    recruiterToken = recRes.token;
    recruiterUser = recRes.user;

    engDept = await prisma.department.findUnique({ where: { code: 'ENG' } });
    jobTitle = await prisma.jobTitle.findFirst();

    // Tạo requisition thử nghiệm
    const reqId = randomUUID();
    testRequisition = await prisma.requisition.create({
      data: {
        id: reqId,
        title: `Requisition SCRUM-107 ${randomUUID().slice(0, 6)}`,
        departmentId: engDept.id,
        hiringManagerId: hrUser.id,
        status: 'APPROVED',
        headcount: 1,
        proposedSalaryMin: 25000000,
        proposedSalaryMax: 40000000,
        requirements: 'Thành thạo TypeScript, React, Vite, CSS Responsive. Có ít nhất 2 năm kinh nghiệm.',
        description: 'Phát triển các tính năng tuyển dụng và giao diện ứng viên chất lượng cao.',
      },
    });
    createdReqIds.push(reqId);
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu test
    if (createdJobIds.length > 0) {
      await prisma.application.deleteMany({
        where: { jobId: { in: createdJobIds } },
      });
      await prisma.job.deleteMany({
        where: { id: { in: createdJobIds } },
      });
    }

    if (createdCandIds.length > 0) {
      await prisma.application.deleteMany({
        where: { candidateId: { in: createdCandIds } },
      });
      await prisma.candidate.deleteMany({
        where: { id: { in: createdCandIds } },
      });
    }

    if (createdReqIds.length > 0) {
      await prisma.requisition.deleteMany({
        where: { id: { in: createdReqIds } },
      });
    }
  });

  async function createTestJob(status: string, overrides: Record<string, any> = {}) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const job = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: overrides.title || `Vị trí kiểm thử SCRUM-107 ${randomUUID().slice(0, 6)}`,
        departmentId: engDept.id,
        hiringManagerId: hrUser.id,
        recruiterId: recruiterUser.id,
        requisitionId: testRequisition.id,
        jobTitleId: jobTitle?.id || null,
        description: overrides.description || 'Mô tả công việc chi tiết: Xây dựng hệ thống giao diện, tối ưu hoá trải nghiệm người dùng mobile và web.',
        location: overrides.location || 'Hà Nội, Việt Nam',
        workMode: overrides.workMode || 'HYBRID',
        applicationDeadline: overrides.applicationDeadline !== undefined ? overrides.applicationDeadline : futureDate,
        showSalary: overrides.showSalary ?? true,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        publishedById: status === 'PUBLISHED' ? hrUser.id : null,
      },
    });
    createdJobIds.push(job.id);
    return job;
  }

  // =========================================================================
  // 1. Xem chi tiết tin tuyển dụng & Dữ liệu hiển thị
  // =========================================================================
  describe('1. Xem chi tiết tin tuyển dụng', () => {
    it('TC01: CANDIDATE xem chi tiết tin PUBLISHED có đủ mô tả công việc, yêu cầu, quyền lợi, hạn nộp', async () => {
      const job = await createTestJob('PUBLISHED');

      const res = await request(app)
        .get(`/api/jobs/${job.id}`)
        .set(authHeader(candidateToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      // 1. Mô tả công việc
      expect(data.description).toBeDefined();
      expect(data.description.length).toBeGreaterThan(10);

      // 2. Yêu cầu công việc (từ requisition)
      expect(data.requisition).toBeDefined();
      expect(data.requisition.requirements).toContain('Thành thạo TypeScript');

      // 3. Quyền lợi (từ companyProfile)
      expect(data.companyProfile).toBeDefined();
      expect(data.companyProfile.benefits).toBeDefined();

      // 4. Hạn nộp
      expect(data.applicationDeadline).toBeDefined();
      expect(data.isExpired).toBe(false);

      // Thông tin lương
      expect(data.salary).toBeDefined();
      expect(data.salary.displayText).toContain('VNĐ');
    });

    it('TC02: Người dùng xem chi tiết tin tuyển dụng công khai qua GET /api/jobs/public/:id mà không cần token', async () => {
      const job = await createTestJob('PUBLISHED', {
        title: 'Senior Frontend Developer Public',
      });

      const res = await request(app)
        .get(`/api/jobs/public/${job.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(job.id);
      expect(res.body.data.title).toBe('Senior Frontend Developer Public');
      expect(res.body.data.description).toBeDefined();
      expect(res.body.data.requisition?.requirements).toBeDefined();
      expect(res.body.data.companyProfile?.benefits).toBeDefined();
      expect(res.body.data.isExpired).toBe(false);
    });

    it('TC03: CANDIDATE không được xem tin DRAFT hoặc REJECTED (403 FORBIDDEN_SCOPE)', async () => {
      const draftJob = await createTestJob('DRAFT');

      const res = await request(app)
        .get(`/api/jobs/${draftJob.id}`)
        .set(authHeader(candidateToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('TC04: Tin tuyển dụng có hạn nộp trong quá khứ được xác định isExpired = true', async () => {
      const pastDeadline = new Date();
      pastDeadline.setDate(pastDeadline.getDate() - 5);

      const expiredJob = await createTestJob('PUBLISHED', {
        applicationDeadline: pastDeadline,
      });

      const res = await request(app)
        .get(`/api/jobs/public/${expiredJob.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isExpired).toBe(true);
    });

    it('TC05: Tin tuyển dụng ở trạng thái CLOSED được xác định isExpired = true', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15);

      const closedJob = await createTestJob('CLOSED', {
        applicationDeadline: futureDate,
      });

      const res = await request(app)
        .get(`/api/jobs/public/${closedJob.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isExpired).toBe(true);
    });
  });

  // =========================================================================
  // 2. Nộp hồ sơ ứng tuyển & Kiểm tra hết hạn
  // =========================================================================
  describe('2. Nộp hồ sơ ứng tuyển & Xử lý tin hết hạn', () => {
    it('TC06: Ứng tuyển thành công khi tin tuyển dụng còn hạn nhận hồ sơ', async () => {
      const job = await createTestJob('PUBLISHED');

      const uniqueEmail = `applicant_${randomUUID().slice(0, 8)}@test.com`;
      const res = await request(app)
        .post(`/api/jobs/public/${job.id}/apply`)
        .send({
          fullName: 'Nguyễn Văn Ứng Viên Mẫu',
          email: uniqueEmail,
          phone: '0987654321',
          cvUrl: 'https://example.com/cv.pdf',
          address: 'Hà Nội',
          expectedSalary: 30000000,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applicationId).toBeDefined();

      createdCandIds.push(res.body.data.candidateId);

      // Kiểm tra trong database có Application liên kết
      const appRecord = await prisma.application.findUnique({
        where: { id: res.body.data.applicationId },
      });
      expect(appRecord).not.toBeNull();
      expect(appRecord?.jobId).toBe(job.id);
      expect(appRecord?.stage).toBe('APPLIED');
    });

    it('TC07: Từ chối nộp hồ sơ khi hạn nộp đã qua (JOB_EXPIRED)', async () => {
      const pastDeadline = new Date();
      pastDeadline.setDate(pastDeadline.getDate() - 10);

      const expiredJob = await createTestJob('PUBLISHED', {
        applicationDeadline: pastDeadline,
      });

      const res = await request(app)
        .post(`/api/jobs/public/${expiredJob.id}/apply`)
        .send({
          fullName: 'Ứng Viên Nộp Muộn',
          email: 'late_applicant@test.com',
          phone: '0123456789',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('JOB_EXPIRED');
      expect(res.body.error.message).toContain('hết hạn');
    });

    it('TC08: Từ chối nộp hồ sơ khi tin ở trạng thái CLOSED (JOB_EXPIRED)', async () => {
      const closedJob = await createTestJob('CLOSED');

      const res = await request(app)
        .post(`/api/jobs/public/${closedJob.id}/apply`)
        .send({
          fullName: 'Ứng Viên Tin Đã Đóng',
          email: 'closed_applicant@test.com',
          phone: '0123456789',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('JOB_EXPIRED');
    });

    it('TC09: Ứng viên đăng nhập nộp hồ sơ qua /api/candidates bị từ chối nếu tin hết hạn', async () => {
      const pastDeadline = new Date();
      pastDeadline.setDate(pastDeadline.getDate() - 2);

      const expiredJob = await createTestJob('PUBLISHED', {
        applicationDeadline: pastDeadline,
      });

      const res = await request(app)
        .post('/api/candidates')
        .set(authHeader(candidateToken))
        .send({
          fullName: 'Ứng Viên Đăng Nhập',
          email: 'candidate1@ats.local',
          jobId: expiredJob.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('JOB_EXPIRED');
    });

    it('TC10: Danh sách việc làm công khai (GET /api/jobs/public) chỉ trả về tin PUBLISHED', async () => {
      const published = await createTestJob('PUBLISHED');
      const draft = await createTestJob('DRAFT');

      const res = await request(app).get('/api/jobs/public');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const ids = res.body.data.map((j: any) => j.id);

      expect(ids).toContain(published.id);
      expect(ids).not.toContain(draft.id);
    });
  });
});
