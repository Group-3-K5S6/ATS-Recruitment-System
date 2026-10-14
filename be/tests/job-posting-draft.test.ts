import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

/**
 * SCRUM-103 (BE-S3-09): API lưu tin tuyển dụng (Job Posting Draft)
 * 
 * Bộ kiểm thử toàn diện:
 * - TC01: Tạo bản nháp thành công từ yêu cầu APPROVED với đầy đủ thông tin
 * - TC02: Kế thừa chính xác phòng ban, hiring manager, chức danh từ Requisition
 * - TC03: Cho phép tiêu đề và mô tả biên tập khác hoàn toàn bản gốc
 * - TC04: Từ chối các yêu cầu chưa được duyệt (DRAFT, PENDING_APPROVAL, REJECTED, CANCELLED)
 * - TC05: Trả về 404 NOT_FOUND khi requisitionId không tồn tại
 * - TC06: Kiểm tra validation dữ liệu đầu vào (độ dài tiêu đề, mô tả, workMode, format ngày)
 * - TC07: Từ chối hạn nhận hồ sơ ở quá khứ
 * - TC08: Kiểm tra quyền truy cập (RECRUITER, HR_MANAGER, ADMIN được phép; CANDIDATE, INTERVIEWER bị chặn 403)
 * - TC09: Từ chối truy cập khi chưa đăng nhập (401 UNAUTHORIZED)
 * - TC10: Bản nháp luôn ở trạng thái DRAFT (không tự ý PUBLISHED)
 * - TC11: Kiểm tra ghi nhận AuditLog với action CREATE_JOB_POSTING_DRAFT
 */
describe('SCRUM-103 (BE-S3-09): API Lưu bản nháp tin tuyển dụng', () => {
  let recruiterToken: string;
  let recruiterUser: any;
  let hrManagerToken: string;
  let adminToken: string;
  let candidateToken: string;
  let interviewerToken: string;

  let testDeptId: string;
  let testJobTitleId: string;
  let approvedReqId: string;
  let draftReqId: string;
  let pendingReqId: string;
  let rejectedReqId: string;
  let cancelledReqId: string;

  const createdJobIds: string[] = [];
  const createdRequisitionIds: string[] = [];

  // Tạo chuỗi ngày hôm nay và tương lai theo định dạng YYYY-MM-DD
  function futureDateStr(daysAhead = 15): string {
    const target = new Date();
    target.setDate(target.getDate() + daysAhead);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function pastDateStr(daysAgo = 5): string {
    const target = new Date();
    target.setDate(target.getDate() - daysAgo);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  beforeAll(async () => {
    // 1. Đăng nhập các vai trò kiểm thử
    const recruiterLogin = await loginAndGetToken('recruiter1@ats.local');
    recruiterToken = recruiterLogin.token;
    recruiterUser = recruiterLogin.user;

    const hrLogin = await loginAndGetToken('hr_manager@ats.local');
    hrManagerToken = hrLogin.token;

    const adminLogin = await loginAndGetToken('admin@ats.local');
    adminToken = adminLogin.token;

    const candLogin = await loginAndGetToken('candidate1@ats.local');
    candidateToken = candLogin.token;

    const intLogin = await loginAndGetToken('interviewer1@ats.local');
    interviewerToken = intLogin.token;

    // 2. Tra cứu phòng ban & chức danh
    const dept = await prisma.department.findFirst({ where: { isActive: true } });
    testDeptId = dept!.id;

    const jobTitle = await prisma.jobTitle.findFirst();
    testJobTitleId = jobTitle!.id;

    // 3. Chuẩn bị yêu cầu tuyển dụng với các trạng thái khác nhau
    // 3.1. APPROVED
    const approvedReq = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: 'Yêu cầu tuyển dụng Kỹ sư Backend Lead (Đã duyệt)',
        departmentId: testDeptId,
        hiringManagerId: hrLogin.user.id,
        jobTitleId: testJobTitleId,
        status: 'APPROVED',
        description: 'Mô tả gốc từ yêu cầu: Cần tuyển Kỹ sư Backend Lead dẫn dắt team dự án.',
        requirements: 'Yêu cầu gốc: 5 năm kinh nghiệm Node.js, microservices.',
      },
    });
    approvedReqId = approvedReq.id;
    createdRequisitionIds.push(approvedReqId);

    // 3.2. DRAFT
    const draftReq = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: 'Yêu cầu tuyển dụng đang nháp',
        departmentId: testDeptId,
        hiringManagerId: hrLogin.user.id,
        jobTitleId: testJobTitleId,
        status: 'DRAFT',
        description: 'Mô tả nháp chưa gửi duyệt.',
      },
    });
    draftReqId = draftReq.id;
    createdRequisitionIds.push(draftReqId);

    // 3.3. PENDING_APPROVAL
    const pendingReq = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: 'Yêu cầu tuyển dụng đang chờ duyệt',
        departmentId: testDeptId,
        hiringManagerId: hrLogin.user.id,
        jobTitleId: testJobTitleId,
        status: 'PENDING_APPROVAL',
        description: 'Mô tả đang chờ sếp duyệt.',
      },
    });
    pendingReqId = pendingReq.id;
    createdRequisitionIds.push(pendingReqId);

    // 3.4. REJECTED
    const rejectedReq = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: 'Yêu cầu tuyển dụng đã bị từ chối',
        departmentId: testDeptId,
        hiringManagerId: hrLogin.user.id,
        jobTitleId: testJobTitleId,
        status: 'REJECTED',
        description: 'Mô tả yêu cầu không được duyệt ngân sách.',
      },
    });
    rejectedReqId = rejectedReq.id;
    createdRequisitionIds.push(rejectedReqId);

    // 3.5. CANCELLED
    const cancelledReq = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: 'Yêu cầu tuyển dụng đã bị hủy',
        departmentId: testDeptId,
        hiringManagerId: hrLogin.user.id,
        jobTitleId: testJobTitleId,
        status: 'CANCELLED',
        description: 'Mô tả yêu cầu đã đóng do tái cấu trúc.',
      },
    });
    cancelledReqId = cancelledReq.id;
    createdRequisitionIds.push(cancelledReqId);
  });

  afterAll(async () => {
    // Dọn dẹp an toàn các bản ghi đã tạo trong test suite
    if (createdJobIds.length > 0) {
      try {
        await prisma.auditLog.deleteMany({
          where: { resourceId: { in: createdJobIds } },
        });
      } catch {}

      try {
        await prisma.job.deleteMany({
          where: { id: { in: createdJobIds } },
        });
      } catch {}
    }

    if (createdRequisitionIds.length > 0) {
      try {
        await prisma.requisition.deleteMany({
          where: { id: { in: createdRequisitionIds } },
        });
      } catch {}
    }
  });

  // =========================================================================
  // TC01: Tạo bản nháp thành công từ yêu cầu APPROVED
  // =========================================================================
  it('TC01: Lưu bản nháp tin tuyển dụng thành công với đầy đủ thông tin hợp lệ', async () => {
    const deadline = futureDateStr(30);
    const payload = {
      requisitionId: approvedReqId,
      title: 'Tuyển dụng Kỹ sư Backend Lead - Thu nhập hấp dẫn',
      description: 'Mô tả tuyển dụng đã được biên tập ngôn ngữ thu hút ứng viên...',
      location: 'Hà Nội & TP. Hồ Chí Minh',
      workMode: 'HYBRID',
      applicationDeadline: deadline,
      showSalary: true,
    };

    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const job = res.body.data;
    createdJobIds.push(job.id);

    // Kiểm tra các trường FE cần
    expect(job.id).toBeDefined();
    expect(job.status).toBe('DRAFT');
    expect(job.requisitionId).toBe(approvedReqId);
    expect(job.title).toBe(payload.title);
    expect(job.description).toBe(payload.description);
    expect(job.location).toBe(payload.location);
    expect(job.workMode).toBe('HYBRID');
    expect(job.showSalary).toBe(true);

    // Kiểm tra định dạng applicationDeadline khớp ngày đã gửi
    expect(new Date(job.applicationDeadline).toISOString().slice(0, 10)).toBe(deadline);

    // Kiểm tra trong database SQLite
    const jobInDb = await prisma.job.findUnique({ where: { id: job.id } });
    expect(jobInDb).not.toBeNull();
    expect(jobInDb!.status).toBe('DRAFT');
    expect(jobInDb!.workMode).toBe('HYBRID');
    expect(jobInDb!.showSalary).toBe(true);
  });

  // =========================================================================
  // TC02: Kế thừa dữ liệu metadata từ Requisition nguồn
  // =========================================================================
  it('TC02: Kế thừa chính xác departmentId, hiringManagerId, jobTitleId và gán recruiterId của người tạo', async () => {
    const payload = {
      requisitionId: approvedReqId,
      title: 'Tuyển dụng Backend Lead Chuyên Nghiệp',
      description: 'Nội dung kế thừa và biên tập chi tiết từ yêu cầu.',
      location: 'Hà Nội',
      workMode: 'ONSITE',
      applicationDeadline: futureDateStr(20),
      showSalary: false,
    };

    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send(payload);

    expect(res.status).toBe(201);
    const job = res.body.data;
    createdJobIds.push(job.id);

    // Requisition nguồn
    const reqSource = await prisma.requisition.findUnique({ where: { id: approvedReqId } });

    expect(job.departmentId).toBe(reqSource!.departmentId);
    expect(job.hiringManagerId).toBe(reqSource!.hiringManagerId);
    expect(job.jobTitleId).toBe(reqSource!.jobTitleId);
    expect(job.recruiterId).toBe(recruiterUser.id);
  });

  // =========================================================================
  // TC03: Cho phép tiêu đề và mô tả biên tập khác nội dung gốc
  // =========================================================================
  it('TC03: Cho phép biên tập tiêu đề và mô tả mới khác bản gốc mà không làm đổi bản gốc', async () => {
    const customTitle = 'Tiêu đề tuyển dụng mới toanh được tối ưu SEO 2026';
    const customDesc = 'Mô tả công việc mới hoàn toàn theo văn phong tuyển dụng hiện đại.';

    const payload = {
      requisitionId: approvedReqId,
      title: customTitle,
      description: customDesc,
      location: 'Đà Nẵng',
      workMode: 'REMOTE',
      applicationDeadline: futureDateStr(10),
    };

    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send(payload);

    expect(res.status).toBe(201);
    const job = res.body.data;
    createdJobIds.push(job.id);

    expect(job.title).toBe(customTitle);
    expect(job.description).toBe(customDesc);
    expect(job.showSalary).toBe(false); // Default value

    // Xác nhận Requisition gốc không bị sửa đổi
    const reqSource = await prisma.requisition.findUnique({ where: { id: approvedReqId } });
    expect(reqSource!.title).not.toBe(customTitle);
    expect(reqSource!.description).not.toBe(customDesc);
  });

  // =========================================================================
  // TC04: Từ chối các yêu cầu có trạng thái khác APPROVED
  // =========================================================================
  it('TC04: Từ chối tạo bản nháp khi yêu cầu nguồn ở trạng thái DRAFT', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: draftReqId,
        title: 'Tin tuyển dụng từ bản nháp',
        description: 'Mô tả công việc tối thiểu mười ký tự.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_STATUS');
    expect(res.body.error.message).toContain('Đã duyệt');
  });

  it('TC04b: Từ chối tạo bản nháp khi yêu cầu nguồn ở trạng thái PENDING_APPROVAL', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: pendingReqId,
        title: 'Tin tuyển dụng từ yêu cầu chờ duyệt',
        description: 'Mô tả công việc tối thiểu mười ký tự.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });

  it('TC04c: Từ chối tạo bản nháp khi yêu cầu nguồn ở trạng thái REJECTED', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: rejectedReqId,
        title: 'Tin tuyển dụng từ yêu cầu bị từ chối',
        description: 'Mô tả công việc tối thiểu mười ký tự.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });

  it('TC04d: Từ chối tạo bản nháp khi yêu cầu nguồn ở trạng thái CANCELLED', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: cancelledReqId,
        title: 'Tin tuyển dụng từ yêu cầu đã hủy',
        description: 'Mô tả công việc tối thiểu mười ký tự.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });

  // =========================================================================
  // TC05: Trả về 404 khi requisitionId không tồn tại
  // =========================================================================
  it('TC05: Trả về 404 NOT_FOUND khi requisitionId không tồn tại', async () => {
    const nonExistentId = randomUUID();
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: nonExistentId,
        title: 'Tin tuyển dụng cho yêu cầu ảo',
        description: 'Mô tả công việc tối thiểu mười ký tự.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toContain('Không tìm thấy yêu cầu tuyển dụng');
  });

  // =========================================================================
  // TC06: Kiểm tra validation dữ liệu đầu vào
  // =========================================================================
  it('TC06a: Báo lỗi 400 khi tiêu đề ít hơn 3 ký tự hoặc rỗng', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: approvedReqId,
        title: 'AB',
        description: 'Mô tả công việc tối thiểu mười ký tự.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('TC06b: Báo lỗi 400 khi mô tả công việc ít hơn 10 ký tự', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Tiêu đề chuẩn',
        description: 'Quá ngắn',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('TC06c: Báo lỗi 400 khi location rỗng', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Tiêu đề chuẩn',
        description: 'Mô tả công việc đủ dài mười ký tự.',
        location: '   ',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('TC06d: Báo lỗi 400 khi workMode không nằm trong [ONSITE, HYBRID, REMOTE]', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Tiêu đề chuẩn',
        description: 'Mô tả công việc đủ dài mười ký tự.',
        location: 'Hà Nội',
        workMode: 'FREELANCE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('TC06e: Báo lỗi 400 khi requisitionId không phải UUID hợp lệ', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: 'not-a-valid-uuid',
        title: 'Tiêu đề chuẩn',
        description: 'Mô tả công việc đủ dài mười ký tự.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(10),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // TC07: Kiểm tra hạn nhận hồ sơ ở quá khứ
  // =========================================================================
  it('TC07: Từ chối khi hạn nhận hồ sơ ở ngày quá khứ', async () => {
    const pastDate = pastDateStr(3);
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Tiêu đề tuyển dụng hợp lệ',
        description: 'Mô tả công việc hợp lệ đủ mười ký tự.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: pastDate,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('quá khứ');
  });

  // =========================================================================
  // TC08: Kiểm tra phân quyền truy cập
  // =========================================================================
  it('TC08a: HR_MANAGER được phép tạo bản nháp tin tuyển dụng (có quyền JOBS_CREATE)', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(hrManagerToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Tiêu đề do HR Manager tạo',
        description: 'Mô tả công việc được phê duyệt bởi HR Manager.',
        location: 'Hà Nội',
        workMode: 'HYBRID',
        applicationDeadline: futureDateStr(15),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    createdJobIds.push(res.body.data.id);
  });

  it('TC08b: ADMIN được phép tạo bản nháp tin tuyển dụng (có quyền JOBS_CREATE)', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(adminToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Tiêu đề do Admin tạo',
        description: 'Mô tả công việc được cấu hình bởi Admin.',
        location: 'Hà Nội',
        workMode: 'REMOTE',
        applicationDeadline: futureDateStr(15),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    createdJobIds.push(res.body.data.id);
  });

  it('TC08c: CANDIDATE bị từ chối 403 FORBIDDEN_SCOPE khi cố tạo bản nháp', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(candidateToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Ứng viên tự tạo tin',
        description: 'Mô tả công việc không hợp lệ.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(15),
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('TC08d: INTERVIEWER bị từ chối 403 FORBIDDEN_SCOPE khi cố tạo bản nháp', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(interviewerToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Người phỏng vấn tự tạo tin',
        description: 'Mô tả công việc không hợp lệ.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(15),
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // TC09: Từ chối truy cập khi chưa đăng nhập
  // =========================================================================
  it('TC09: Trả về 401 UNAUTHORIZED khi không có Bearer token', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .send({
        requisitionId: approvedReqId,
        title: 'Chưa đăng nhập',
        description: 'Mô tả công việc chưa đăng nhập.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(15),
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // TC10: Bản nháp luôn ở trạng thái DRAFT
  // =========================================================================
  it('TC10: Tin mới tạo luôn giữ trạng thái DRAFT kể cả khi client gửi status khác', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Thử nghiệm ép trạng thái PUBLISHED',
        description: 'Mô tả công việc để kiểm tra tính toàn vẹn trạng thái.',
        location: 'Hà Nội',
        workMode: 'ONSITE',
        applicationDeadline: futureDateStr(25),
        status: 'PUBLISHED', // Client cố tình gửi PUBLISHED
      });

    expect(res.status).toBe(201);
    const job = res.body.data;
    createdJobIds.push(job.id);

    expect(job.status).toBe('DRAFT');

    const jobInDb = await prisma.job.findUnique({ where: { id: job.id } });
    expect(jobInDb!.status).toBe('DRAFT');
  });

  // =========================================================================
  // TC11: Ghi nhận AuditLog với action CREATE_JOB_POSTING_DRAFT
  // =========================================================================
  it('TC11: Tự động ghi nhật ký AuditLog với action CREATE_JOB_POSTING_DRAFT', async () => {
    const res = await request(app)
      .post('/api/job-posting-drafts')
      .set(authHeader(recruiterToken))
      .send({
        requisitionId: approvedReqId,
        title: 'Tiêu đề kiểm tra AuditLog',
        description: 'Mô tả công việc để kiểm tra việc ghi nhận AuditLog.',
        location: 'Hà Nội',
        workMode: 'REMOTE',
        applicationDeadline: futureDateStr(14),
        showSalary: true,
      });

    expect(res.status).toBe(201);
    const job = res.body.data;
    createdJobIds.push(job.id);

    // Kiểm tra bản ghi AuditLog trong database
    const audit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'job',
        resourceId: job.id,
        action: 'CREATE_JOB_POSTING_DRAFT',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(recruiterUser.id);
    expect(audit!.metadata).toBeDefined();

    const meta = JSON.parse(audit!.metadata!);
    expect(meta.requisitionId).toBe(approvedReqId);
    expect(meta.title).toBe(job.title);
    expect(meta.workMode).toBe('REMOTE');
    expect(meta.showSalary).toBe(true);
  });
});
