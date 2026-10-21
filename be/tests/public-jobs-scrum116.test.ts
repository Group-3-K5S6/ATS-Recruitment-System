import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('SCRUM-116: Ứng viên xem danh sách việc làm công khai không cần tài khoản', () => {
  let deptEngId: string;
  let deptHrId: string;
  let hmUserId: string;
  let approverUserId: string;
  let publisherUserId: string;

  const testJobIds: string[] = [];

  beforeAll(async () => {
    // Lấy hoặc tạo phòng ban phục vụ test
    const deptEng = await prisma.department.upsert({
      where: { code: 'ENG_S116' },
      update: {},
      create: { name: 'Kỹ thuật Công nghệ S116', code: 'ENG_S116' },
    });
    deptEngId = deptEng.id;

    const deptHr = await prisma.department.upsert({
      where: { code: 'HR_S116' },
      update: {},
      create: { name: 'Nhân sự và Đào tạo S116', code: 'HR_S116' },
    });
    deptHrId = deptHr.id;

    // Lấy hoặc tạo user phục vụ test
    let testUser = await prisma.user.findFirst();
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: `user_${randomUUID()}@ats.local`,
          fullName: 'Test User S116',
          passwordHash: 'dummy-hash',
        },
      });
    }
    hmUserId = testUser.id;
    approverUserId = testUser.id;
    publisherUserId = testUser.id;

    const now = new Date();
    const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // -10 days

    // 1. Job Published, còn hạn (hợp lệ để hiển thị công khai)
    const job1 = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Backend Nodejs Developer S116',
        description: 'Xây dựng API bảo mật và tối ưu hiệu năng cơ sở dữ liệu Postgres và SQLite.',
        departmentId: deptEngId,
        hiringManagerId: hmUserId,
        status: 'PUBLISHED',
        location: 'Hà Nội',
        workMode: 'HYBRID',
        approvedAt: now,
        approvedById: approverUserId,
        publishedAt: now,
        publishedById: publisherUserId,
        applicationDeadline: futureDate,
        approvalNotes: 'Nội bộ: Duyệt nhanh',
        rejectionReason: null,
      },
    });
    testJobIds.push(job1.id);

    // 2. Job Published, không giới hạn hạn chót (applicationDeadline = null)
    const job2 = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Frontend ReactJS Specialist S116',
        description: 'Phát triển giao diện web portal responsive với React, Vite và Tailwind.',
        departmentId: deptEngId,
        hiringManagerId: hmUserId,
        status: 'PUBLISHED',
        location: 'Đà Nẵng',
        workMode: 'REMOTE',
        approvedAt: now,
        approvedById: approverUserId,
        publishedAt: now,
        publishedById: publisherUserId,
        applicationDeadline: null,
      },
    });
    testJobIds.push(job2.id);

    // 3. Job Published, thuộc phòng ban HR, ONSITE
    const job3 = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Chuyên viên Tuyển dụng Nhân sự S116',
        description: 'Tìm kiếm nhân tài công nghệ và điều phối quy trình phỏng vấn.',
        departmentId: deptHrId,
        hiringManagerId: hmUserId,
        status: 'PUBLISHED',
        location: 'Hồ Chí Minh',
        workMode: 'ONSITE',
        approvedAt: now,
        approvedById: approverUserId,
        publishedAt: now,
        publishedById: publisherUserId,
        applicationDeadline: futureDate,
      },
    });
    testJobIds.push(job3.id);

    // 4. Job ĐÃ HẾT HẠN (applicationDeadline trong quá khứ) -> Không được hiển thị
    const expiredJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'DevOps Engineer Hết Hạn S116',
        description: 'Quản lý cụm Kubernetes và CI/CD pipeline.',
        departmentId: deptEngId,
        hiringManagerId: hmUserId,
        status: 'PUBLISHED',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        approvedAt: now,
        approvedById: approverUserId,
        publishedAt: now,
        publishedById: publisherUserId,
        applicationDeadline: pastDate,
      },
    });
    testJobIds.push(expiredJob.id);

    // 5. Job CHƯA XUẤT BẢN (DRAFT) -> Không được hiển thị
    const draftJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Bản Nháp Kỹ sư QA S116',
        description: 'Viết automated tests và manual QA.',
        departmentId: deptEngId,
        hiringManagerId: hmUserId,
        status: 'DRAFT',
        location: 'Hà Nội',
        workMode: 'ONSITE',
      },
    });
    testJobIds.push(draftJob.id);

    // 6. Job APPROVED nhưng chưa bấm PUBLISHED -> Không được hiển thị
    const approvedOnlyJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Product Owner Đã Duyệt Chưa Publish S116',
        description: 'Định hướng sản phẩm ATS.',
        departmentId: deptEngId,
        hiringManagerId: hmUserId,
        status: 'APPROVED',
        location: 'Hà Nội',
        approvedAt: now,
        approvedById: approverUserId,
        publishedAt: null,
      },
    });
    testJobIds.push(approvedOnlyJob.id);

    // 7. Job CLOSED -> Không được hiển thị
    const closedJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Vị trí Đã Đóng S116',
        description: 'Vị trí đã đóng tuyển dụng.',
        departmentId: deptEngId,
        hiringManagerId: hmUserId,
        status: 'CLOSED',
        location: 'Hà Nội',
        approvedAt: now,
        publishedAt: now,
      },
    });
    testJobIds.push(closedJob.id);

    // 8. Edge Case: Job có applicationDeadline đúng thời điểm hiện tại (còn hạn tuyển)
    const exactNowJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Kỹ sư AI Deadline Đúng Bây Giờ S116',
        description: 'Huấn luyện và fine-tune mô hình ngôn ngữ lớn LLM.',
        departmentId: deptEngId,
        hiringManagerId: hmUserId,
        status: 'PUBLISHED',
        location: 'Hà Nội',
        workMode: 'REMOTE',
        approvedAt: now,
        approvedById: approverUserId,
        publishedAt: now,
        publishedById: publisherUserId,
        applicationDeadline: new Date(Date.now() + 60000), // Vừa tạo, còn hạn 1 phút
      },
    });
    testJobIds.push(exactNowJob.id);

    // 9. Edge Case: Job thiếu toàn bộ các trường tùy chọn (jobTitleId null, recruiterId null, applicationDeadline null)
    const minimalJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Thiết kế Đồ họa Tối giản S116',
        description: 'Thiết kế ấn phẩm truyền thông thương hiệu.',
        departmentId: deptHrId,
        hiringManagerId: hmUserId,
        status: 'PUBLISHED',
        location: 'Cần Thơ',
        workMode: 'ONSITE',
        approvedAt: now,
        approvedById: approverUserId,
        publishedAt: now,
        publishedById: publisherUserId,
        jobTitleId: null,
        recruiterId: null,
        requisitionId: null,
        applicationDeadline: null,
      },
    });
    testJobIds.push(minimalJob.id);
  });

  afterAll(async () => {
    if (testJobIds.length > 0) {
      await prisma.job.deleteMany({
        where: { id: { in: testJobIds } },
      });
    }
  });

  describe('1. Quyền truy cập ẩn danh (Không yêu cầu đăng nhập)', () => {
    it('cho phép gọi GET /api/public/jobs mà không có Authorization header (HTTP 200)', async () => {
      const res = await request(app).get('/api/public/jobs');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('2. Chỉ trả về việc làm đã xuất bản và còn hạn tuyển dụng', () => {
    it('không bao gồm các việc làm DRAFT, APPROVED (chưa xuất bản), CLOSED hoặc đã hết hạn', async () => {
      const res = await request(app).get('/api/public/jobs');
      expect(res.status).toBe(200);

      const returnedIds = res.body.data.map((j: any) => j.id);
      // Job 1, 2, 3, 8, 9 phải có mặt
      expect(returnedIds).toContain(testJobIds[0]);
      expect(returnedIds).toContain(testJobIds[1]);
      expect(returnedIds).toContain(testJobIds[2]);
      expect(returnedIds).toContain(testJobIds[7]); // exactNowJob
      expect(returnedIds).toContain(testJobIds[8]); // minimalJob

      // Job 4 (hết hạn), 5 (draft), 6 (approved only), 7 (closed) KHÔNG được xuất hiện
      expect(returnedIds).not.toContain(testJobIds[3]);
      expect(returnedIds).not.toContain(testJobIds[4]);
      expect(returnedIds).not.toContain(testJobIds[5]);
      expect(returnedIds).not.toContain(testJobIds[6]);
    });
  });

  describe('3. Lọc theo Phòng ban (Department)', () => {
    it('lọc chính xác theo departmentId', async () => {
      const res = await request(app).get(`/api/public/jobs?departmentId=${deptHrId}`);
      expect(res.status).toBe(200);
      const jobs = res.body.data;
      expect(jobs.length).toBeGreaterThanOrEqual(2);
      jobs.forEach((j: any) => {
        expect(j.department.id).toBe(deptHrId);
      });
    });

    it('lọc theo tên hoặc mã phòng ban (department)', async () => {
      const res = await request(app).get('/api/public/jobs?department=ENG_S116');
      expect(res.status).toBe(200);
      const jobs = res.body.data;
      expect(jobs.length).toBeGreaterThanOrEqual(3);
      jobs.forEach((j: any) => {
        expect(j.department.code).toBe('ENG_S116');
      });
    });

    it('tham số department="ALL" không làm lọc mất danh sách', async () => {
      const resAll = await request(app).get('/api/public/jobs?department=ALL');
      const resDefault = await request(app).get('/api/public/jobs');
      expect(resAll.status).toBe(200);
      expect(resAll.body.data.length).toBe(resDefault.body.data.length);
    });

    it('tham số department="   " (chỉ khoảng trắng) được bỏ qua không lọc', async () => {
      const res = await request(app).get('/api/public/jobs?department=%20%20%20');
      const resDefault = await request(app).get('/api/public/jobs');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(resDefault.body.data.length);
    });

    it('trả về danh sách rỗng khi phòng ban không có tin tuyển dụng nào', async () => {
      const emptyDept = await prisma.department.create({
        data: { name: 'Phòng ban Rỗng S116', code: `EMPTY_${randomUUID().slice(0, 6)}` },
      });
      const res = await request(app).get(`/api/public/jobs?departmentId=${emptyDept.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      await prisma.department.delete({ where: { id: emptyDept.id } });
    });
  });

  describe('4. Lọc theo Địa điểm (Location)', () => {
    it('lọc theo địa điểm "Hà Nội"', async () => {
      const res = await request(app).get('/api/public/jobs?location=Hà Nội');
      expect(res.status).toBe(200);
      const jobs = res.body.data;
      const ids = jobs.map((j: any) => j.id);
      expect(ids).toContain(testJobIds[0]);
      expect(ids).not.toContain(testJobIds[1]); // Đà Nẵng
      expect(ids).not.toContain(testJobIds[2]); // Hồ Chí Minh
      jobs.forEach((j: any) => {
        expect(j.location).toContain('Hà Nội');
      });
    });

    it('lọc theo địa điểm "Đà Nẵng"', async () => {
      const res = await request(app).get('/api/public/jobs?location=Đà Nẵng');
      expect(res.status).toBe(200);
      const jobs = res.body.data;
      const ids = jobs.map((j: any) => j.id);
      expect(ids).toContain(testJobIds[1]);
      expect(ids).not.toContain(testJobIds[0]);
    });

    it('tham số location="ALL" hoặc rỗng không làm lọc mất danh sách', async () => {
      const res = await request(app).get('/api/public/jobs?location=ALL');
      const resBlank = await request(app).get('/api/public/jobs?location=%20%20');
      const resDefault = await request(app).get('/api/public/jobs');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(resDefault.body.data.length);
      expect(resBlank.body.data.length).toBe(resDefault.body.data.length);
    });

    it('trả về danh sách rỗng khi địa điểm không tồn tại', async () => {
      const res = await request(app).get('/api/public/jobs?location=DiaDiemKhongTonTai999');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('5. Lọc theo Hình thức làm việc (Work Mode)', () => {
    it('lọc hình thức HYBRID', async () => {
      const res = await request(app).get('/api/public/jobs?workMode=HYBRID');
      expect(res.status).toBe(200);
      const jobs = res.body.data;
      const ids = jobs.map((j: any) => j.id);
      expect(ids).toContain(testJobIds[0]); // HYBRID
      expect(ids).not.toContain(testJobIds[1]); // REMOTE
      expect(ids).not.toContain(testJobIds[2]); // ONSITE
      jobs.forEach((j: any) => {
        expect(j.workMode).toBe('HYBRID');
      });
    });

    it('lọc hình thức REMOTE', async () => {
      const res = await request(app).get('/api/public/jobs?workMode=REMOTE');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((j: any) => j.id);
      expect(ids).toContain(testJobIds[1]);
      expect(ids).not.toContain(testJobIds[0]);
    });

    it('lọc hình thức ONSITE bằng query employmentType', async () => {
      const res = await request(app).get('/api/public/jobs?employmentType=ONSITE');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((j: any) => j.id);
      expect(ids).toContain(testJobIds[2]);
    });

    it('hỗ trợ tiếng Việt "Linh hoạt" cho HYBRID', async () => {
      const res = await request(app).get('/api/public/jobs?workMode=Linh hoạt');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((j: any) => j.id);
      expect(ids).toContain(testJobIds[0]);
    });

    it('tham số workMode="ALL" hoặc rỗng không làm lọc mất danh sách', async () => {
      const resAll = await request(app).get('/api/public/jobs?workMode=ALL');
      const resBlank = await request(app).get('/api/public/jobs?workMode=%20%20');
      const resDefault = await request(app).get('/api/public/jobs');
      expect(resAll.status).toBe(200);
      expect(resAll.body.data.length).toBe(resDefault.body.data.length);
      expect(resBlank.body.data.length).toBe(resDefault.body.data.length);
    });

    it('báo lỗi 400 VALIDATION_ERROR khi workMode không hợp lệ', async () => {
      const res = await request(app).get('/api/public/jobs?workMode=INVALID_MODE_VALUE');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Hình thức làm việc không hợp lệ');
    });
  });

  describe('6. Tìm kiếm theo từ khóa trong tiêu đề và mô tả công việc', () => {
    it('tìm kiếm theo từ khóa có trong tiêu đề (ví dụ "Nodejs")', async () => {
      const res = await request(app).get('/api/public/jobs?keyword=Nodejs');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((j: any) => j.id);
      expect(ids).toContain(testJobIds[0]);
      expect(ids).not.toContain(testJobIds[1]);
      expect(ids).not.toContain(testJobIds[2]);
    });

    it('tìm kiếm theo từ khóa có trong mô tả công việc (ví dụ "Tailwind")', async () => {
      const res = await request(app).get('/api/public/jobs?search=Tailwind');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((j: any) => j.id);
      expect(ids).toContain(testJobIds[1]); // Frontend job chứa 'Tailwind' trong description
      expect(ids).not.toContain(testJobIds[0]);
      expect(ids).not.toContain(testJobIds[2]);
    });

    it('hỗ trợ query param "q" để tìm kiếm', async () => {
      const res = await request(app).get('/api/public/jobs?q=Nhân tài công nghệ');
      expect(res.status).toBe(200);
      const ids = res.body.data.map((j: any) => j.id);
      expect(ids).toContain(testJobIds[2]); // HR job
    });

    it('từ khóa rỗng hoặc chỉ có khoảng trắng không bị lọc bỏ dữ liệu', async () => {
      const res = await request(app).get('/api/public/jobs?keyword=%20%20%20');
      const resDefault = await request(app).get('/api/public/jobs');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(resDefault.body.data.length);
    });

    it('trả về danh sách rỗng khi từ khóa không khớp tiêu đề hoặc mô tả nào', async () => {
      const res = await request(app).get('/api/public/jobs?keyword=TuKhoaKhongTonTai12345');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('7. Kết hợp nhiều bộ lọc đồng thời (Phòng ban + Địa điểm + Hình thức + Từ khóa)', () => {
    it('trả về đúng tin khi kết hợp tất cả các tiêu chí lọc', async () => {
      const res = await request(app).get(
        `/api/public/jobs?departmentId=${deptEngId}&location=Hà Nội&workMode=HYBRID&keyword=Nodejs`
      );
      expect(res.status).toBe(200);
      const jobs = res.body.data;
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(testJobIds[0]);
    });

    it('trả về rỗng khi một trong các tiêu chí kết hợp không thỏa mãn', async () => {
      // Đúng department, đúng location, đúng keyword nhưng sai workMode (ONSITE thay vì HYBRID)
      const res = await request(app).get(
        `/api/public/jobs?departmentId=${deptEngId}&location=Hà Nội&workMode=ONSITE&keyword=Nodejs`
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('8. Xử lý tham số không hợp lệ (Validation & Error handling)', () => {
    it('trả về 400 VALIDATION_ERROR khi departmentId không phải UUID', async () => {
      const res = await request(app).get('/api/public/jobs?departmentId=not-a-valid-uuid');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('departmentId');
    });

    it('trả về 400 VALIDATION_ERROR khi page <= 0', async () => {
      const res = await request(app).get('/api/public/jobs?page=0');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('trả về 400 VALIDATION_ERROR khi page không phải số', async () => {
      const res = await request(app).get('/api/public/jobs?page=abc');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('trả về 400 VALIDATION_ERROR khi limit không hợp lệ', async () => {
      const res = await request(app).get('/api/public/jobs?limit=500');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('9. Hỗ trợ Phân trang (Pagination) & Edge cases', () => {
    it('tôn trọng tham số limit và trả về header X-Total-Count kèm Access-Control-Expose-Headers', async () => {
      const res = await request(app).get('/api/public/jobs?limit=2');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.headers['x-total-count']).toBeDefined();
      expect(res.headers['access-control-expose-headers']).toContain('X-Total-Count');
    });

    it('hoạt động chuẩn khi có page mà không truyền limit (tự động dùng default limit = 10, không bị NaN)', async () => {
      const res = await request(app).get('/api/public/jobs?page=2');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.headers['x-total-count']).toBeDefined();
    });

    it('trả về định dạng object phân trang khi có query paginate=true', async () => {
      const res = await request(app).get('/api/public/jobs?paginate=true&limit=2&page=1');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page', 1);
      expect(res.body.data).toHaveProperty('limit', 2);
      expect(res.body.data).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('xử lý an toàn khi số trang page vượt quá tổng số trang (page > totalPages)', async () => {
      const res = await request(app).get('/api/public/jobs?paginate=true&page=9999&limit=10');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.page).toBe(9999);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('10. Bảo vệ dữ liệu nhạy cảm nội bộ & dữ liệu thiếu trường tùy chọn', () => {
    it('không bao giờ trả về approvalNotes, rejectionReason, approvedById, publishedById trong danh sách công khai', async () => {
      const res = await request(app).get(`/api/public/jobs?keyword=Nodejs`);
      expect(res.status).toBe(200);
      const str = JSON.stringify(res.body);
      expect(str).not.toContain('Nội bộ: Duyệt nhanh');
      expect(str).not.toContain('approvalNotes');
      expect(str).not.toContain('rejectionReason');
      expect(str).not.toContain('approvedById');
      expect(str).not.toContain('publishedById');
    });

    it('trả về bình thường đối với việc làm thiếu các trường tùy chọn (jobTitleId null, applicationDeadline null)', async () => {
      const res = await request(app).get(`/api/public/jobs?keyword=Tối giản`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(testJobIds[8]);
      expect(res.body.data[0].jobTitle).toBeNull();
      expect(res.body.data[0].applicationDeadline).toBeNull();
    });
  });
});
