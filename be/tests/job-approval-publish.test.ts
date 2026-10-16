import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { loginAndGetToken, authHeader } from './test-helper';
import { AuditAction } from '../src/rbac/types';

/**
 * SCRUM-105: BE-API duyệt và xuất bản tin tuyển dụng
 *
 * User story:
 * "Là Trưởng phòng Nhân sự, tôi muốn duyệt và xuất bản tin tuyển dụng, để tin đăng ra ngoài luôn đúng chuẩn thương hiệu công ty."
 *
 * Tiêu chí chấp nhận (Acceptance Criteria):
 * 1. Tin phải qua duyệt trước khi hiển thị công khai (Status bắt buộc là APPROVED trước khi được phép PUBLISH).
 * 2. Xem trước đúng như giao diện công khai trước khi xuất bản (Cung cấp API preview đầy đủ tin + thông tin thương hiệu công ty).
 * 3. Ghi lại người xuất bản và thời điểm (Lưu publishedById, publishedAt và ghi nhận AuditLog).
 */
describe('SCRUM-105: BE-API duyệt và xuất bản tin tuyển dụng', () => {
  let hrToken = '';
  let hrUser: any;
  let adminToken = '';
  let recruiterToken = '';
  let recruiterUser: any;
  let hiringManagerToken = '';
  let candidateToken = '';
  let interviewerToken = '';

  let engDept: any;
  let jobTitle: any;
  let approvedRequisition: any;

  const createdJobIds: string[] = [];
  const createdReqIds: string[] = [];

  beforeAll(async () => {
    // Đăng nhập các vai trò
    const [hrRes, adminRes, recRes, hmRes, candRes, intRes] = await Promise.all([
      loginAndGetToken('hr_manager@ats.local'),
      loginAndGetToken('admin@ats.local'),
      loginAndGetToken('recruiter1@ats.local'),
      loginAndGetToken('hiring_manager_eng@ats.local'),
      loginAndGetToken('candidate1@ats.local'),
      loginAndGetToken('interviewer1@ats.local'),
    ]);

    hrToken = hrRes.token;
    hrUser = hrRes.user;
    adminToken = adminRes.token;
    recruiterToken = recRes.token;
    recruiterUser = recRes.user;
    hiringManagerToken = hmRes.token;
    candidateToken = candRes.token;
    interviewerToken = intRes.token;

    // Lấy department và job title
    engDept = await prisma.department.findUnique({ where: { code: 'ENG' } });
    jobTitle = await prisma.jobTitle.findFirst();

    // Tạo một Requisition ở trạng thái APPROVED
    const reqId = randomUUID();
    approvedRequisition = await prisma.requisition.create({
      data: {
        id: reqId,
        title: `Yêu cầu tuyển dụng kiểm thử duyệt xuất bản ${randomUUID().slice(0, 6)}`,
        departmentId: engDept.id,
        hiringManagerId: hrUser.id,
        status: 'APPROVED',
        headcount: 2,
        proposedSalaryMin: 20000000,
        proposedSalaryMax: 35000000,
        requirements: 'Ít nhất 2 năm kinh nghiệm Node.js và TypeScript.',
        description: 'Mô tả chi tiết công việc tuyển dụng.',
      },
    });
    createdReqIds.push(reqId);
  });

  afterAll(async () => {
    if (createdJobIds.length > 0) {
      await prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
    }
    if (createdReqIds.length > 0) {
      await prisma.requisition.deleteMany({ where: { id: { in: createdReqIds } } });
    }
    await prisma.$disconnect();
  });

  /**
   * Helper tạo nhanh một Job với trạng thái chỉ định
   */
  async function createTestJob(status = 'DRAFT', customFields: any = {}) {
    const id = randomUUID();
    const job = await prisma.job.create({
      data: {
        id,
        title: `Kỹ sư phần mềm ${randomUUID().slice(0, 6)}`,
        description: 'Mô tả công việc kỹ sư phần mềm backend tiêu chuẩn.',
        location: 'Hà Nội',
        workMode: 'HYBRID',
        applicationDeadline: new Date(Date.now() + 15 * 86400000),
        showSalary: true,
        status,
        departmentId: engDept.id,
        hiringManagerId: hrUser.id,
        recruiterId: recruiterUser.id,
        requisitionId: approvedRequisition.id,
        jobTitleId: jobTitle?.id,
        ...customFields,
      },
    });
    createdJobIds.push(id);
    return job;
  }

  // =========================================================================
  // 1. Phân quyền và Quy trình Phê duyệt tin tuyển dụng
  // =========================================================================
  describe('1. Phê duyệt & Từ chối tin tuyển dụng (Approval & Rejection flow)', () => {
    it('TC01: HR_MANAGER phê duyệt tin tuyển dụng thành công, chuyển sang APPROVED', async () => {
      const job = await createTestJob('PENDING_APPROVAL');

      const res = await request(app)
        .post(`/api/jobs/${job.id}/approve`)
        .set(authHeader(hrToken))
        .send({ notes: 'Nội dung JD chuẩn thương hiệu công ty, đồng ý duyệt.' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.approvedById).toBe(hrUser.id);
      expect(res.body.data.approvedAt).not.toBeNull();
      expect(res.body.data.approvalNotes).toBe('Nội dung JD chuẩn thương hiệu công ty, đồng ý duyệt.');
      expect(res.body.data.approvedBy).toBeDefined();
      expect(res.body.data.approvedBy.id).toBe(hrUser.id);

      // Kiểm tra trong database
      const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(dbJob?.status).toBe('APPROVED');
      expect(dbJob?.approvedById).toBe(hrUser.id);

      // Kiểm tra ghi nhận AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          resourceType: 'job',
          resourceId: job.id,
          action: AuditAction.JOB_POSTING_APPROVED,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(hrUser.id);
    });

    it('TC02: ADMIN có quyền phê duyệt tin tuyển dụng thành công', async () => {
      const job = await createTestJob('PENDING_APPROVAL');

      const res = await request(app)
        .post(`/api/jobs/${job.id}/approve`)
        .set(authHeader(adminToken))
        .send({ notes: 'Admin phê duyệt tin tuyển dụng.' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
    });

    it('TC03: RECRUITER / HIRING_MANAGER / INTERVIEWER / CANDIDATE không có quyền duyệt tin (403)', async () => {
      const job = await createTestJob('DRAFT');

      // Recruiter cố duyệt tin
      const resRecruiter = await request(app)
        .post(`/api/jobs/${job.id}/approve`)
        .set(authHeader(recruiterToken))
        .send({ notes: 'Recruiter cố duyệt' });
      expect(resRecruiter.status).toBe(403);

      // Hiring Manager cố duyệt tin
      const resHM = await request(app)
        .post(`/api/jobs/${job.id}/approve`)
        .set(authHeader(hiringManagerToken))
        .send({ notes: 'HM cố duyệt' });
      expect(resHM.status).toBe(403);

      // Interviewer cố duyệt tin
      const resInterviewer = await request(app)
        .post(`/api/jobs/${job.id}/approve`)
        .set(authHeader(interviewerToken))
        .send({ notes: 'Interviewer cố duyệt' });
      expect(resInterviewer.status).toBe(403);

      // Candidate cố duyệt tin
      const resCandidate = await request(app)
        .post(`/api/jobs/${job.id}/approve`)
        .set(authHeader(candidateToken))
        .send({ notes: 'Candidate cố duyệt' });
      expect(resCandidate.status).toBe(403);
    });

    it('TC04: Không có token bị từ chối 401 UNAUTHORIZED', async () => {
      const job = await createTestJob('DRAFT');

      const res = await request(app)
        .post(`/api/jobs/${job.id}/approve`)
        .send({ notes: 'No auth' });

      expect(res.status).toBe(401);
    });

    it('S3-10: HR_MANAGER không được duyệt thẳng DRAFT khi chưa gửi duyệt', async () => {
      const job = await createTestJob('DRAFT');
      const res = await request(app)
        .post(`/api/jobs/${job.id}/approve`)
        .set(authHeader(hrToken))
        .send({ notes: 'Thử bỏ qua bước gửi duyệt' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
      expect((await prisma.job.findUnique({ where: { id: job.id } }))?.status).toBe('DRAFT');
    });

    it('TC05: Duyệt tin không tồn tại trả về 404 NOT_FOUND', async () => {
      const nonExistentId = randomUUID();
      const res = await request(app)
        .post(`/api/jobs/${nonExistentId}/approve`)
        .set(authHeader(hrToken))
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('TC06: Từ chối duyệt lại khi tin đã ở trạng thái APPROVED', async () => {
      const job = await createTestJob('APPROVED');

      const res = await request(app)
        .post(`/api/jobs/${job.id}/approve`)
        .set(authHeader(hrToken))
        .send({ notes: 'Duyệt lại' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ALREADY_APPROVED');
    });

    it('TC07: HR_MANAGER từ chối tin tuyển dụng với lý do hợp lệ, chuyển sang REJECTED', async () => {
      const job = await createTestJob('PENDING_APPROVAL');

      const res = await request(app)
        .post(`/api/jobs/${job.id}/reject`)
        .set(authHeader(hrToken))
        .send({ reason: 'Yêu cầu điều chỉnh lại nội dung phúc lợi và mô tả công việc.' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.rejectionReason).toBe('Yêu cầu điều chỉnh lại nội dung phúc lợi và mô tả công việc.');

      // Kiểm tra database
      const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(dbJob?.status).toBe('REJECTED');
      expect(dbJob?.rejectionReason).toBe('Yêu cầu điều chỉnh lại nội dung phúc lợi và mô tả công việc.');

      // Kiểm tra AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          resourceType: 'job',
          resourceId: job.id,
          action: AuditAction.JOB_POSTING_REJECTED,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(hrUser.id);
    });

    it('TC08: Bắt buộc nhập lý do từ chối tối thiểu 3 ký tự (validation error 400)', async () => {
      const job = await createTestJob('DRAFT');

      const resEmpty = await request(app)
        .post(`/api/jobs/${job.id}/reject`)
        .set(authHeader(hrToken))
        .send({ reason: '' });
      expect(resEmpty.status).toBe(400);

      const resShort = await request(app)
        .post(`/api/jobs/${job.id}/reject`)
        .set(authHeader(hrToken))
        .send({ reason: 'Ko' });
      expect(resShort.status).toBe(400);
    });
  });

  // =========================================================================
  // 2. Tiêu chí 1: Tin phải qua duyệt trước khi hiển thị công khai
  // =========================================================================
  describe('2. Tiêu chí 1: Tin phải qua duyệt trước khi hiển thị công khai', () => {
    it('TC09: Cố xuất bản tin ở trạng thái DRAFT bị chặn 400 INVALID_STATUS', async () => {
      const job = await createTestJob('DRAFT');

      const res = await request(app)
        .post(`/api/jobs/${job.id}/publish`)
        .set(authHeader(hrToken));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
      expect(res.body.error.message).toContain('phải được phê duyệt');

      // Đảm bảo tin vẫn ở trạng thái DRAFT
      const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(dbJob?.status).toBe('DRAFT');
    });

    it('TC10: Cố xuất bản tin ở trạng thái PENDING_APPROVAL bị chặn 400 INVALID_STATUS', async () => {
      const job = await createTestJob('PENDING_APPROVAL');

      const res = await request(app)
        .post(`/api/jobs/${job.id}/publish`)
        .set(authHeader(hrToken));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('TC11: Cố xuất bản tin ở trạng thái REJECTED bị chặn 400 INVALID_STATUS', async () => {
      const job = await createTestJob('REJECTED', {
        rejectionReason: 'Lý do bị từ chối trước đó',
      });

      const res = await request(app)
        .post(`/api/jobs/${job.id}/publish`)
        .set(authHeader(hrToken));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('TC12: RECRUITER cố ý xuất bản tin bị chặn 403 FORBIDDEN_SCOPE', async () => {
      // Dù tin đã ở trạng thái APPROVED
      const job = await createTestJob('APPROVED', {
        approvedById: hrUser.id,
        approvedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/jobs/${job.id}/publish`)
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });
  });

  // =========================================================================
  // 3. Tiêu chí 3: Ghi lại người xuất bản và thời điểm
  // =========================================================================
  describe('3. Tiêu chí 3: Ghi lại người xuất bản và thời điểm (Publishing & Audit)', () => {
    it('TC13: HR_MANAGER xuất bản tin APPROVED thành công, ghi lại chính xác người xuất bản và thời điểm', async () => {
      const job = await createTestJob('APPROVED', {
        approvedById: hrUser.id,
        approvedAt: new Date(),
        approvalNotes: 'Đã thông qua kiểm duyệt.',
      });

      const timeBefore = new Date();
      const res = await request(app)
        .post(`/api/jobs/${job.id}/publish`)
        .set(authHeader(hrToken));
      const timeAfter = new Date();

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PUBLISHED');
      expect(res.body.data.publishedById).toBe(hrUser.id);
      expect(res.body.data.publishedBy).toBeDefined();
      expect(res.body.data.publishedBy.id).toBe(hrUser.id);
      expect(res.body.data.publishedBy.email).toBe('hr_manager@ats.local');

      // Thời điểm xuất bản
      const publishedAt = new Date(res.body.data.publishedAt);
      expect(publishedAt.getTime()).toBeGreaterThanOrEqual(timeBefore.getTime() - 1000);
      expect(publishedAt.getTime()).toBeLessThanOrEqual(timeAfter.getTime() + 1000);

      // Kiểm tra database lưu chính xác
      const dbJob = await prisma.job.findUnique({
        where: { id: job.id },
        include: { publishedBy: true, approvedBy: true },
      });
      expect(dbJob?.status).toBe('PUBLISHED');
      expect(dbJob?.publishedById).toBe(hrUser.id);
      expect(dbJob?.publishedBy?.fullName).toBe(hrUser.fullName);
      expect(dbJob?.approvedById).toBe(hrUser.id);

      // Kiểm tra AuditLog ghi nhận đúng action JOB_POSTING_PUBLISHED
      const audit = await prisma.auditLog.findFirst({
        where: {
          resourceType: 'job',
          resourceId: job.id,
          action: AuditAction.JOB_POSTING_PUBLISHED,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(hrUser.id);
      const metadata = JSON.parse(audit?.metadata || '{}');
      expect(metadata.publishedById).toBe(hrUser.id);
      expect(metadata.publishedAt).toBeDefined();
    });

    it('S3-10: Chặn xuất bản khi status APPROVED bị ghi thủ công nhưng thiếu dấu vết duyệt', async () => {
      const job = await createTestJob('APPROVED', { approvedAt: null, approvedById: null });
      const res = await request(app).post(`/api/jobs/${job.id}/publish`).set(authHeader(hrToken));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_APPROVAL');
      expect((await prisma.job.findUnique({ where: { id: job.id } }))?.publishedAt).toBeNull();
    });

    it('TC14: Lấy chi tiết tin (GET /api/jobs/:id) trả về đầy đủ approvedBy và publishedBy', async () => {
      const job = await createTestJob('PUBLISHED', {
        approvedById: hrUser.id,
        approvedAt: new Date(),
        publishedById: hrUser.id,
        publishedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/jobs/${job.id}`)
        .set(authHeader(hrToken));

      expect(res.status).toBe(200);
      expect(res.body.data.approvedBy).toBeDefined();
      expect(res.body.data.approvedBy.id).toBe(hrUser.id);
      expect(res.body.data.publishedBy).toBeDefined();
      expect(res.body.data.publishedBy.id).toBe(hrUser.id);
    });

    it('TC15: Xuất bản lại tin đã ở trạng thái PUBLISHED trả về lỗi 400', async () => {
      const job = await createTestJob('PUBLISHED', {
        approvedById: hrUser.id,
        approvedAt: new Date(),
        publishedById: hrUser.id,
        publishedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/jobs/${job.id}/publish`)
        .set(authHeader(hrToken));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ALREADY_PUBLISHED');
    });
  });

  // =========================================================================
  // 4. Tiêu chí 2: Xem trước đúng như giao diện công khai trước khi xuất bản
  // =========================================================================
  describe('4. Tiêu chí 2: Xem trước tin tuyển dụng (Preview API)', () => {
    it('TC16: HR_MANAGER xem trước tin tuyển dụng nhận đủ thông tin JD và thương hiệu công ty', async () => {
      const job = await createTestJob('APPROVED', {
        approvedById: hrUser.id,
        approvedAt: new Date(),
        showSalary: true,
      });

      const res = await request(app)
        .get(`/api/jobs/${job.id}/preview`)
        .set(authHeader(hrToken));

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();

      // Kiểm tra dữ liệu tin tuyển dụng
      const previewJob = res.body.data.job;
      expect(previewJob.id).toBe(job.id);
      expect(previewJob.title).toBe(job.title);
      expect(previewJob.description).toBe(job.description);
      expect(previewJob.location).toBe(job.location);
      expect(previewJob.workMode).toBe(job.workMode);
      expect(previewJob.department).toBeDefined();
      expect(previewJob.department.name).toBe(engDept.name);

      // Kiểm tra thông tin thương hiệu công ty (CompanyProfile)
      const companyProfile = res.body.data.companyProfile;
      expect(companyProfile).toBeDefined();
      expect(companyProfile.companyName).toBeDefined();
      expect(companyProfile.introduction).toBeDefined();
      expect(companyProfile.culture).toBeDefined();
      expect(companyProfile.benefits).toBeDefined();
      expect(companyProfile.website).toBeDefined();
      expect(companyProfile.contactEmail).toBeDefined();
    });

    it('TC17: Khi showSalary = false, dải lương xem trước hiển thị Thoả thuận', async () => {
      const job = await createTestJob('APPROVED', {
        showSalary: false,
      });

      const res = await request(app)
        .get(`/api/jobs/${job.id}/preview`)
        .set(authHeader(hrToken));

      expect(res.status).toBe(200);
      expect(res.body.data.job.salary.showSalary).toBe(false);
      expect(res.body.data.job.salary.displayText).toBe('Thoả thuận');
      expect(res.body.data.job.salary.min).toBeNull();
      expect(res.body.data.job.salary.max).toBeNull();
    });

    it('TC18: Khi showSalary = true, hiển thị mức lương thực tế từ Requisition / JobTitle', async () => {
      const job = await createTestJob('APPROVED', {
        showSalary: true,
      });

      const res = await request(app)
        .get(`/api/jobs/${job.id}/preview`)
        .set(authHeader(hrToken));

      expect(res.status).toBe(200);
      expect(res.body.data.job.salary.showSalary).toBe(true);
      expect(res.body.data.job.salary.min).toBe(20000000);
      expect(res.body.data.job.salary.max).toBe(35000000);
      expect(res.body.data.job.salary.displayText).toContain('20.000.000');
    });

    it('TC19: Recruiter được phân công được phép xem trước tin tuyển dụng', async () => {
      const job = await createTestJob('DRAFT', {
        recruiterId: recruiterUser.id,
      });

      const res = await request(app)
        .get(`/api/jobs/${job.id}/preview`)
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(200);
      expect(res.body.data.job.id).toBe(job.id);
    });

    it('TC20: CANDIDATE và INTERVIEWER bị chặn 403 khi xem trước tin chưa xuất bản', async () => {
      const job = await createTestJob('APPROVED');

      // Candidate
      const resCandidate = await request(app)
        .get(`/api/jobs/${job.id}/preview`)
        .set(authHeader(candidateToken));
      expect(resCandidate.status).toBe(403);

      // Interviewer
      const resInterviewer = await request(app)
        .get(`/api/jobs/${job.id}/preview`)
        .set(authHeader(interviewerToken));
      expect(resInterviewer.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. Hiển thị công khai & Gỡ tin tuyển dụng
  // =========================================================================
  describe('5. Hiển thị công khai và Gỡ tin tuyển dụng', () => {
    it('TC21: CANDIDATE chỉ thấy tin PUBLISHED, không thể thấy tin DRAFT, APPROVED (chưa xuất bản) hoặc REJECTED', async () => {
      const draftJob = await createTestJob('DRAFT');
      const approvedJob = await createTestJob('APPROVED');
      const rejectedJob = await createTestJob('REJECTED');
      const publishedJob = await createTestJob('PUBLISHED');

      const res = await request(app)
        .get('/api/jobs')
        .set(authHeader(candidateToken));

      expect(res.status).toBe(200);
      const jobIds = res.body.data.map((j: any) => j.id);

      expect(jobIds).toContain(publishedJob.id);
      expect(jobIds).not.toContain(draftJob.id);
      expect(jobIds).not.toContain(approvedJob.id);
      expect(jobIds).not.toContain(rejectedJob.id);
    });

    it('TC22: HR_MANAGER gỡ tin tuyển dụng (POST /api/jobs/:id/unpublish), tin chuyển sang CLOSED', async () => {
      const job = await createTestJob('PUBLISHED', {
        publishedById: hrUser.id,
        publishedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/jobs/${job.id}/unpublish`)
        .set(authHeader(hrToken));

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CLOSED');

      // Ứng viên không còn thấy tin này nữa
      const candidateList = await request(app)
        .get('/api/jobs')
        .set(authHeader(candidateToken));
      const candIds = candidateList.body.data.map((j: any) => j.id);
      expect(candIds).not.toContain(job.id);

      // Kiểm tra AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          resourceType: 'job',
          resourceId: job.id,
          action: AuditAction.JOB_POSTING_CLOSED,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
    });

    it('TC23: Nộp tin tuyển dụng để chờ phê duyệt (submit-for-approval)', async () => {
      const job = await createTestJob('DRAFT', {
        recruiterId: recruiterUser.id,
      });

      const res = await request(app)
        .post(`/api/jobs/${job.id}/submit-for-approval`)
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_APPROVAL');

      // Kiểm tra database
      const dbJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(dbJob?.status).toBe('PENDING_APPROVAL');
    });

    it('TC24: Lọc tin tuyển dụng theo trạng thái qua query param (GET /api/jobs?status=APPROVED)', async () => {
      const approvedJob = await createTestJob('APPROVED');
      const draftJob = await createTestJob('DRAFT');

      const res = await request(app)
        .get('/api/jobs?status=APPROVED')
        .set(authHeader(hrToken));

      expect(res.status).toBe(200);
      const ids = res.body.data.map((j: any) => j.id);
      expect(ids).toContain(approvedJob.id);
      expect(ids).not.toContain(draftJob.id);
    });
  });
});
