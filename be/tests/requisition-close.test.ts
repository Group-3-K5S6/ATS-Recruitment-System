/**
 * SCRUM-99: BE API tạm dừng / đóng yêu cầu tuyển dụng
 *
 * Kiểm thử các trường hợp:
 *  1. Hủy (CANCEL) thành công -> status = CANCELLED, lịch sử ghi nhận
 *  2. Tạm dừng (ON_HOLD) thành công -> status = ON_HOLD
 *  3. Đã tuyển đủ (FILLED) thành công -> status = FILLED
 *  4. Thiếu lý do -> 400 VALIDATION_ERROR
 *  5. Action không hợp lệ -> 400 VALIDATION_ERROR
 *  6. Không có quyền (Hiring Manager / Approver / Recruiter) -> 403 FORBIDDEN_SCOPE
 *  7. Requisition không tồn tại -> 404 NOT_FOUND
 *  8. Trạng thái kết thúc (CANCELLED/FILLED) không thể chuyển thêm -> 400 INVALID_STATUS
 *  9. ON_HOLD trên requisition đang ON_HOLD -> 400 INVALID_STATUS
 * 10. Còn ứng viên pipeline, không có force -> cảnh báo 200 PIPELINE_WARNING
 * 11. Còn ứng viên pipeline, force=true -> thực hiện thành công
 * 12. Tự động gỡ tin PUBLISHED khi đóng
 * 13. Audit log được ghi khi hủy / tạm dừng / tuyển đủ
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

describe('SCRUM-99: Tạm dừng / Đóng yêu cầu tuyển dụng', () => {
  // ----- Tokens -----
  let hrManagerToken: string;
  let hrManagerUser: any;
  let adminToken: string;
  let hiringManagerToken: string;
  let hiringManagerUser: any;
  let approverToken: string;
  let recruiterToken: string;

  // ----- Fixtures -----
  let testDepartmentId: string;
  let testJobTitleId: string;
  const createdRequisitionIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdCandidateIds: string[] = [];
  const createdApplicationIds: string[] = [];

  // ============================================================
  // beforeAll: đăng nhập + tạo dữ liệu cơ sở
  // ============================================================
  beforeAll(async () => {
    const hrLogin = await loginAndGetToken('hr_manager@ats.local');
    hrManagerToken = hrLogin.token;
    hrManagerUser = hrLogin.user;

    const adminLogin = await loginAndGetToken('admin@ats.local');
    adminToken = adminLogin.token;

    const hmLogin = await loginAndGetToken('hiring_manager_eng@ats.local');
    hiringManagerToken = hmLogin.token;
    hiringManagerUser = hmLogin.user;

    const approverLogin = await loginAndGetToken('approver@ats.local');
    approverToken = approverLogin.token;

    const recruiterLogin = await loginAndGetToken('recruiter1@ats.local');
    recruiterToken = recruiterLogin.token;

    testDepartmentId = hrManagerUser.departmentId ?? hiringManagerUser.departmentId;

    // Tạo chức danh dùng cho bài test
    const jobTitle = await prisma.jobTitle.create({
      data: {
        id: randomUUID(),
        code: `SCRUM99-${randomUUID().slice(0, 8)}`,
        name: 'Chức danh test SCRUM-99',
        level: 'Senior',
        minSalary: 15000000,
        maxSalary: 40000000,
      },
    });
    testJobTitleId = jobTitle.id;
  });

  // ============================================================
  // afterAll: dọn dữ liệu test
  // ============================================================
  afterAll(async () => {
    if (createdApplicationIds.length > 0) {
      await prisma.application.deleteMany({
        where: { id: { in: createdApplicationIds } },
      });
    }
    if (createdCandidateIds.length > 0) {
      await prisma.candidate.deleteMany({
        where: { id: { in: createdCandidateIds } },
      });
    }
    if (createdJobIds.length > 0) {
      await prisma.job.deleteMany({
        where: { id: { in: createdJobIds } },
      });
    }
    if (createdRequisitionIds.length > 0) {
      await prisma.requisitionApprovalHistory.deleteMany({
        where: { requisitionId: { in: createdRequisitionIds } },
      });
      await prisma.requisition.deleteMany({
        where: { id: { in: createdRequisitionIds } },
      });
    }
    if (testJobTitleId) {
      await prisma.jobTitle.deleteMany({ where: { id: testJobTitleId } });
    }
  });

  // ============================================================
  // Helpers
  // ============================================================
  async function createRequisition(overrides: Record<string, any> = {}) {
    const req = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: `SCRUM-99 Req ${randomUUID().slice(0, 6)}`,
        departmentId: testDepartmentId,
        jobTitleId: testJobTitleId,
        hiringManagerId: hiringManagerUser.id,
        headcount: 1,
        status: 'APPROVED',
        reason: 'NEW',
        proposedSalaryMin: 20000000,
        proposedSalaryMax: 35000000,
        targetDate: new Date('2099-06-01'),
        description: 'Mô tả kiểm thử SCRUM-99',
        requirements: 'TypeScript & NodeJS 3+ năm',
        ...overrides,
      },
    });
    createdRequisitionIds.push(req.id);
    return req;
  }

  async function createPublishedJob(requisitionId: string) {
    const job = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Tin tuyển dụng SCRUM-99',
        requisitionId,
        departmentId: testDepartmentId,
        hiringManagerId: hiringManagerUser.id,
        description: 'Mô tả tin SCRUM-99 đang PUBLISHED',
        status: 'PUBLISHED',
      },
    });
    createdJobIds.push(job.id);
    return job;
  }

  async function createActiveApplication(jobId: string) {
    const candidate = await prisma.candidate.create({
      data: {
        id: randomUUID(),
        fullName: `Ứng viên SCRUM-99 ${randomUUID().slice(0, 4)}`,
        email: `candidate-scrum99-${randomUUID().slice(0, 8)}@test.local`,
      },
    });
    createdCandidateIds.push(candidate.id);

    const application = await prisma.application.create({
      data: {
        id: randomUUID(),
        candidateId: candidate.id,
        jobId,
        stage: 'APPLIED',
        status: 'ACTIVE',
      },
    });
    createdApplicationIds.push(application.id);
    return { candidate, application };
  }

  // ============================================================
  // 1. Hủy (CANCEL) thành công
  // ============================================================
  describe('Tiêu chí 1: Hủy (CANCEL) thành công', () => {
    it('HR Manager hủy requisition APPROVED -> CANCELLED, ghi lịch sử', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'Nhu cầu tuyển dụng đã thay đổi.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');

      // Kiểm tra lịch sử
      const history = await prisma.requisitionApprovalHistory.findFirst({
        where: { requisitionId: req.id, decision: 'CANCEL' },
      });
      expect(history).not.toBeNull();
      expect(history?.fromStatus).toBe('APPROVED');
      expect(history?.toStatus).toBe('CANCELLED');
      expect(history?.notes).toBe('Nhu cầu tuyển dụng đã thay đổi.');
      expect(history?.actorId).toBe(hrManagerUser.id);
    });

    it('Admin hủy requisition PENDING_APPROVAL -> CANCELLED', async () => {
      const req = await createRequisition({ status: 'PENDING_APPROVAL' });

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(adminToken))
        .send({ action: 'CANCEL', reason: 'Hủy bởi Admin.' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  // ============================================================
  // 2. Tạm dừng (ON_HOLD) thành công
  // ============================================================
  describe('Tiêu chí 2: Tạm dừng (ON_HOLD) thành công', () => {
    it('HR Manager tạm dừng requisition APPROVED -> ON_HOLD', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'ON_HOLD', reason: 'Freeze headcount quý 4.' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ON_HOLD');

      const history = await prisma.requisitionApprovalHistory.findFirst({
        where: { requisitionId: req.id, decision: 'ON_HOLD' },
      });
      expect(history?.toStatus).toBe('ON_HOLD');
    });

    it('HR Manager tạm dừng requisition DRAFT -> ON_HOLD (hợp lệ)', async () => {
      const req = await createRequisition({ status: 'DRAFT' });

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'ON_HOLD', reason: 'Chờ ngân sách.' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ON_HOLD');
    });
  });

  // ============================================================
  // 3. Đã tuyển đủ (FILLED) thành công
  // ============================================================
  describe('Tiêu chí 3: Đã tuyển đủ (FILLED) thành công', () => {
    it('HR Manager đánh dấu FILLED -> trạng thái chính xác, lịch sử ghi nhận', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'FILLED', reason: 'Đã tuyển được 2 ứng viên phù hợp.' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('FILLED');

      const history = await prisma.requisitionApprovalHistory.findFirst({
        where: { requisitionId: req.id, decision: 'FILLED' },
      });
      expect(history?.toStatus).toBe('FILLED');
      expect(history?.notes).toBe('Đã tuyển được 2 ứng viên phù hợp.');
    });
  });

  // ============================================================
  // 4. Validation: thiếu lý do
  // ============================================================
  describe('Tiêu chí 4: Validation body', () => {
    it('Thiếu lý do -> 400 VALIDATION_ERROR', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Lý do rỗng (chuỗi trắng) -> 400 VALIDATION_ERROR', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Action không hợp lệ -> 400 VALIDATION_ERROR', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'UNKNOWN_ACTION', reason: 'Lý do.' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Thiếu cả action và reason -> 400 VALIDATION_ERROR', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================
  // 5. Phân quyền: chỉ HR_MANAGER và ADMIN được phép
  // ============================================================
  describe('Tiêu chí 5: Phân quyền RBAC', () => {
    it('Hiring Manager -> 403 FORBIDDEN_SCOPE', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hiringManagerToken))
        .send({ action: 'CANCEL', reason: 'Không có quyền.' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('Approver -> 403 (không có permission REQUISITIONS_UPDATE)', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(approverToken))
        .send({ action: 'ON_HOLD', reason: 'Không có quyền.' });

      // Approver không có REQUISITIONS_UPDATE permission -> bị chặn tại middleware
      expect(res.status).toBe(403);
    });

    it('Recruiter -> 403 FORBIDDEN_SCOPE', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(recruiterToken))
        .send({ action: 'FILLED', reason: 'Không có quyền.' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('Unauthenticated -> 401', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .send({ action: 'CANCEL', reason: 'Không token.' });

      expect(res.status).toBe(401);
    });
  });

  // ============================================================
  // 6. Yêu cầu không tồn tại -> 404
  // ============================================================
  describe('Tiêu chí 6: Không tìm thấy yêu cầu', () => {
    it('ID không tồn tại -> 404 NOT_FOUND', async () => {
      const res = await request(app)
        .post(`/api/requisitions/${randomUUID()}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'ID giả.' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ============================================================
  // 7. Sai trạng thái: CANCELLED / FILLED không thể chuyển tiếp
  // ============================================================
  describe('Tiêu chí 7: Trạng thái kết thúc không thể chuyển', () => {
    it('Requisition CANCELLED -> CANCEL lại -> 400 INVALID_STATUS', async () => {
      const req = await createRequisition({ status: 'CANCELLED' });

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'Hủy lại.' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('Requisition FILLED -> ON_HOLD -> 400 INVALID_STATUS', async () => {
      const req = await createRequisition({ status: 'FILLED' });

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'ON_HOLD', reason: 'Không hợp lệ.' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('Requisition ON_HOLD -> ON_HOLD lại -> 400 INVALID_STATUS', async () => {
      const req = await createRequisition({ status: 'ON_HOLD' });

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'ON_HOLD', reason: 'Đã tạm dừng rồi.' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('Requisition ON_HOLD có thể CANCEL được (hợp lệ)', async () => {
      const req = await createRequisition({ status: 'ON_HOLD' });

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'Hủy hẳn sau khi tạm dừng.' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });

  // ============================================================
  // 8. Cảnh báo pipeline: còn ứng viên, chưa force
  // ============================================================
  describe('Tiêu chí 8: Cảnh báo ứng viên trong pipeline', () => {
    it('Còn ứng viên ACTIVE, force=false -> 200 PIPELINE_WARNING (không thực hiện)', async () => {
      const req = await createRequisition();
      const job = await createPublishedJob(req.id);
      await createActiveApplication(job.id);

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'Đóng.', force: false });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('PIPELINE_WARNING');
      expect(res.body.data.warning).toBe(true);
      expect(res.body.data.activeCandidateCount).toBeGreaterThan(0);

      // Trạng thái không thay đổi
      const still = await prisma.requisition.findUnique({ where: { id: req.id } });
      expect(still?.status).toBe('APPROVED');
    });

    it('Còn ứng viên ACTIVE, force=true -> thực hiện thành công, không xóa ứng viên', async () => {
      const req = await createRequisition();
      const job = await createPublishedJob(req.id);
      const { application } = await createActiveApplication(job.id);

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'Đóng có xác nhận.', force: true });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');

      // Ứng viên không bị xóa
      const appStill = await prisma.application.findUnique({ where: { id: application.id } });
      expect(appStill).not.toBeNull();
    });
  });

  // ============================================================
  // 9. Tự động gỡ tin PUBLISHED khi đóng
  // ============================================================
  describe('Tiêu chí 9: Tự động gỡ tin tuyển dụng PUBLISHED', () => {
    it('Tin PUBLISHED liên kết bị chuyển sang CLOSED khi hủy requisition', async () => {
      const req = await createRequisition();
      const job = await createPublishedJob(req.id);

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'Đóng - tự động gỡ tin.' });

      expect(res.status).toBe(200);
      expect(res.body.data.unpublishedJobCount).toBe(1);

      const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(updatedJob?.status).toBe('CLOSED');
    });

    it('Tin PUBLISHED liên kết bị CLOSED khi ON_HOLD', async () => {
      const req = await createRequisition();
      const job = await createPublishedJob(req.id);

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'ON_HOLD', reason: 'Tạm dừng tuyển.' });

      expect(res.status).toBe(200);

      const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
      expect(updatedJob?.status).toBe('CLOSED');
    });

    it('Requisition không có tin nào -> unpublishedJobCount = 0', async () => {
      const req = await createRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'FILLED', reason: 'Đã tuyển đủ, không có tin công khai.' });

      expect(res.status).toBe(200);
      expect(res.body.data.unpublishedJobCount).toBe(0);
    });

    it('Tin DRAFT không bị ảnh hưởng khi đóng requisition', async () => {
      const req = await createRequisition();
      const draftJob = await prisma.job.create({
        data: {
          id: randomUUID(),
          title: 'Tin DRAFT SCRUM-99',
          requisitionId: req.id,
          departmentId: testDepartmentId,
          hiringManagerId: hiringManagerUser.id,
          description: 'Tin bản nháp',
          status: 'DRAFT',
        },
      });
      createdJobIds.push(draftJob.id);

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'Đóng - tin DRAFT không bị ảnh hưởng.' });

      expect(res.status).toBe(200);
      expect(res.body.data.unpublishedJobCount).toBe(0);

      const draftStill = await prisma.job.findUnique({ where: { id: draftJob.id } });
      expect(draftStill?.status).toBe('DRAFT');
    });
  });

  // ============================================================
  // 10. Audit log
  // ============================================================
  describe('Tiêu chí 10: Audit log được ghi nhận', () => {
    it('Audit log REQUISITION_CLOSED ghi khi hủy', async () => {
      const req = await createRequisition();

      await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'Kiểm tra audit.' });

      const audit = await prisma.auditLog.findFirst({
        where: { resourceId: req.id, action: 'REQUISITION_CLOSED' },
      });

      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(hrManagerUser.id);
    });

    it('Audit log REQUISITION_ON_HOLD ghi khi tạm dừng', async () => {
      const req = await createRequisition();

      await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'ON_HOLD', reason: 'Kiểm tra audit ON_HOLD.' });

      const audit = await prisma.auditLog.findFirst({
        where: { resourceId: req.id, action: 'REQUISITION_ON_HOLD' },
      });

      expect(audit).not.toBeNull();
    });

    it('Audit log REQUISITION_FILLED ghi khi tuyển đủ', async () => {
      const req = await createRequisition();

      await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'FILLED', reason: 'Kiểm tra audit FILLED.' });

      const audit = await prisma.auditLog.findFirst({
        where: { resourceId: req.id, action: 'REQUISITION_FILLED' },
      });

      expect(audit).not.toBeNull();
    });
  });

  // ============================================================
  // 11. Lịch sử phê duyệt (approval-history) hiển thị đúng
  // ============================================================
  describe('Tiêu chí 11: Lịch sử chuyển trạng thái hiển thị qua approval-history API', () => {
    it('Lịch sử hiển thị decision=CANCEL sau khi hủy', async () => {
      const req = await createRequisition();

      await request(app)
        .post(`/api/requisitions/${req.id}/close`)
        .set(authHeader(hrManagerToken))
        .send({ action: 'CANCEL', reason: 'Lý do lịch sử.' });

      const histRes = await request(app)
        .get(`/api/requisitions/${req.id}/approval-history`)
        .set(authHeader(hrManagerToken));

      expect(histRes.status).toBe(200);
      const history = histRes.body.data.history;
      const closeEntry = history.find((h: any) => h.decision === 'CANCEL');
      expect(closeEntry).toBeDefined();
      expect(closeEntry.fromStatus).toBe('APPROVED');
      expect(closeEntry.toStatus).toBe('CANCELLED');
      expect(closeEntry.notes).toBe('Lý do lịch sử.');
    });
  });
});
