import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

/**
 * SCRUM-91 – BE: API trạng thái và lịch sử phê duyệt yêu cầu tuyển dụng
 *
 * Kiểm thử:
 *  1. Người có quyền xem được trạng thái và lịch sử đúng.
 *  2. Người không có quyền không xem được dữ liệu.
 *  3. Trả lỗi khi requisition không tồn tại.
 *  4. Lịch sử thể hiện đúng người duyệt, thời gian, ý kiến, thứ tự.
 *  5. Phân biệt chính xác trạng thái PENDING / APPROVED / REJECTED.
 *  6. Thao tác approve/reject ghi lịch sử; lịch sử không thể xóa/sửa qua API.
 */
describe('SCRUM-91 – Approval History API', () => {
  let hrManagerToken: string;
  let approverToken: string;
  let hmEngToken: string;
  let hmMktToken: string;
  let candidateToken: string;

  let approverId: string;

  let pendingReqId: string;
  let approvedReqId: string;
  let rejectedReqId: string;
  let draftReqId: string;

  let jobTitleId: string;
  let deptId: string;

  beforeAll(async () => {
    const hrLogin = await loginAndGetToken('hr_manager@ats.local');
    hrManagerToken = hrLogin.token;
    deptId = hrLogin.user.departmentId;
    await prisma.departmentHeadcountBudget.upsert({
      where: { departmentId_year: { departmentId: deptId, year: 2099 } },
      create: { departmentId: deptId, year: 2099, headcount: 10000 },
      update: { headcount: 10000 },
    });

    const approverLogin = await loginAndGetToken('approver@ats.local');
    approverToken = approverLogin.token;
    approverId = approverLogin.user.id;

    hmEngToken = (await loginAndGetToken('hiring_manager_eng@ats.local')).token;
    hmMktToken = (await loginAndGetToken('hiring_manager_mkt@ats.local')).token;
    candidateToken = (await loginAndGetToken('candidate1@ats.local')).token;

    // Tạo JobTitle phục vụ test
    const jt = await prisma.jobTitle.create({
      data: {
        id: randomUUID(),
        code: `S291-${randomUUID().slice(0, 8)}`,
        name: 'Test JobTitle S2-91',
        level: 'Nhân viên',
        minSalary: 10_000_000,
        maxSalary: 30_000_000,
      },
    });
    jobTitleId = jt.id;

    const baseReqData = {
      departmentId: deptId,
      jobTitleId,
      reason: 'NEW',
      headcount: 1,
      proposedSalaryMin: 10_000_000,
      proposedSalaryMax: 20_000_000,
      targetDate: '2099-12-31T00:00:00.000Z',
      description: 'Mô tả vị trí kiểm thử SCRUM-91.',
      requirements: 'Yêu cầu kiểm thử SCRUM-91.',
      approverId,
    };

    // Tạo requisition ở trạng thái PENDING_APPROVAL
    const pendingRes = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hrManagerToken))
      .send(baseReqData);
    expect(pendingRes.status).toBe(201);
    pendingReqId = pendingRes.body.data.id;

    // Tạo draft requisition
    const draftRes = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hrManagerToken))
      .send({ isDraft: true });
    expect(draftRes.status).toBe(201);
    draftReqId = draftRes.body.data.id;

    // Tạo rồi approve để có APPROVED requisition
    const toApproveRes = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hrManagerToken))
      .send(baseReqData);
    expect(toApproveRes.status).toBe(201);
    approvedReqId = toApproveRes.body.data.id;

    const approveResult = await request(app)
      .post(`/api/requisitions/${approvedReqId}/approve`)
      .set(authHeader(approverToken))
      .send({ decision: 'APPROVE', notes: 'Hồ sơ đầy đủ, đồng ý duyệt.' });
    expect(approveResult.status).toBe(200);

    // Tạo rồi reject để có REJECTED requisition
    const toRejectRes = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hrManagerToken))
      .send(baseReqData);
    expect(toRejectRes.status).toBe(201);
    rejectedReqId = toRejectRes.body.data.id;

    const rejectResult = await request(app)
      .post(`/api/requisitions/${rejectedReqId}/approve`)
      .set(authHeader(approverToken))
      .send({ decision: 'REJECT', notes: 'Ngân sách không phù hợp.' });
    expect(rejectResult.status).toBe(200);
  });

  afterAll(async () => {
    if (deptId) {
      await prisma.departmentHeadcountBudget.deleteMany({
        where: { departmentId: deptId, year: 2099 },
      });
    }
    const ids = [pendingReqId, approvedReqId, rejectedReqId, draftReqId].filter(Boolean);
    await prisma.requisition.deleteMany({ where: { id: { in: ids } } });
    if (jobTitleId) {
      await prisma.jobTitle.deleteMany({ where: { id: jobTitleId } });
    }
  });

  // ───────────────────────────────────────────
  // 1. Quyền truy cập
  // ───────────────────────────────────────────
  describe('Phân quyền truy cập (RBAC)', () => {
    it('HR_MANAGER có quyền xem lịch sử phê duyệt', async () => {
      const res = await request(app)
        .get(`/api/requisitions/${pendingReqId}/approval-history`)
        .set(authHeader(hrManagerToken));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requisitionId).toBe(pendingReqId);
    });

    it('APPROVER có quyền xem lịch sử phê duyệt', async () => {
      const res = await request(app)
        .get(`/api/requisitions/${pendingReqId}/approval-history`)
        .set(authHeader(approverToken));
      expect(res.status).toBe(200);
    });

    it('CANDIDATE bị từ chối (403) khi xem lịch sử phê duyệt', async () => {
      const res = await request(app)
        .get(`/api/requisitions/${pendingReqId}/approval-history`)
        .set(authHeader(candidateToken));
      expect(res.status).toBe(403);
      // CANDIDATE không có permission requisitions:read nên bị chặn ở middleware
      expect(['FORBIDDEN_PERMISSION', 'FORBIDDEN_SCOPE']).toContain(res.body.error.code);
    });

    it('Không có token bị từ chối (401)', async () => {
      const res = await request(app)
        .get(`/api/requisitions/${pendingReqId}/approval-history`);
      expect(res.status).toBe(401);
    });
  });

  // ───────────────────────────────────────────
  // 2. Xử lý lỗi
  // ───────────────────────────────────────────
  describe('Xử lý lỗi', () => {
    it('Trả 404 khi requisition không tồn tại', async () => {
      const fakeId = randomUUID();
      const res = await request(app)
        .get(`/api/requisitions/${fakeId}/approval-history`)
        .set(authHeader(hrManagerToken));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('Từ chối approve khi requisition đã APPROVED (không phải PENDING)', async () => {
      const res = await request(app)
        .post(`/api/requisitions/${approvedReqId}/approve`)
        .set(authHeader(approverToken))
        .send({ decision: 'APPROVE', notes: 'Duyệt lần 2' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });
  });

  // ───────────────────────────────────────────
  // 3. Trạng thái PENDING_APPROVAL
  // ───────────────────────────────────────────
  describe('Trạng thái PENDING_APPROVAL', () => {
    it('currentStatus là PENDING_APPROVAL và có currentPendingApprover', async () => {
      const res = await request(app)
        .get(`/api/requisitions/${pendingReqId}/approval-history`)
        .set(authHeader(hrManagerToken));
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.currentStatus).toBe('PENDING_APPROVAL');
      expect(data.currentPendingApprover).not.toBeNull();
      expect(data.currentPendingApprover.id).toBeDefined();
      expect(data.history).toHaveLength(0);
      expect(data.totalSteps).toBe(0);
    });

    it('response chứa đủ các trường bắt buộc', async () => {
      const res = await request(app)
        .get(`/api/requisitions/${pendingReqId}/approval-history`)
        .set(authHeader(hrManagerToken));
      const data = res.body.data;
      expect(data).toHaveProperty('requisitionId');
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('currentStatus');
      expect(data).toHaveProperty('department');
      expect(data).toHaveProperty('hiringManager');
      expect(data).toHaveProperty('designatedApprover');
      expect(data).toHaveProperty('currentPendingApprover');
      expect(data).toHaveProperty('totalSteps');
      expect(data).toHaveProperty('history');
      expect(Array.isArray(data.history)).toBe(true);
    });
  });

  // ───────────────────────────────────────────
  // 4. Trạng thái APPROVED
  // ───────────────────────────────────────────
  describe('Trạng thái APPROVED', () => {
    it('currentStatus là APPROVED, history có 1 entry APPROVE với đúng thông tin', async () => {
      const res = await request(app)
        .get(`/api/requisitions/${approvedReqId}/approval-history`)
        .set(authHeader(hrManagerToken));
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.currentStatus).toBe('APPROVED');
      // Đã hoàn tất, không có người chờ xử lý
      expect(data.currentPendingApprover).toBeNull();
      expect(data.history).toHaveLength(1);
      expect(data.totalSteps).toBe(1);

      const step = data.history[0];
      expect(step.decision).toBe('APPROVE');
      expect(step.fromStatus).toBe('PENDING_APPROVAL');
      expect(step.toStatus).toBe('APPROVED');
      expect(step.notes).toBe('Hồ sơ đầy đủ, đồng ý duyệt.');
      expect(step.actor).toBeDefined();
      expect(step.actor.id).toBe(approverId);
      expect(step.processedAt).toBeDefined();
    });
  });

  // ───────────────────────────────────────────
  // 5. Trạng thái REJECTED
  // ───────────────────────────────────────────
  describe('Trạng thái REJECTED', () => {
    it('currentStatus là REJECTED, history có 1 entry REJECT, không có người chờ', async () => {
      const res = await request(app)
        .get(`/api/requisitions/${rejectedReqId}/approval-history`)
        .set(authHeader(hrManagerToken));
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.currentStatus).toBe('REJECTED');
      expect(data.currentPendingApprover).toBeNull();
      expect(data.history).toHaveLength(1);

      const step = data.history[0];
      expect(step.decision).toBe('REJECT');
      expect(step.fromStatus).toBe('PENDING_APPROVAL');
      expect(step.toStatus).toBe('REJECTED');
      expect(step.notes).toBe('Ngân sách không phù hợp.');
      expect(step.actor.id).toBe(approverId);
    });
  });

  // ───────────────────────────────────────────
  // 6. Trạng thái DRAFT
  // ───────────────────────────────────────────
  describe('Trạng thái DRAFT', () => {
    it('DRAFT: history rỗng, currentPendingApprover là null', async () => {
      const res = await request(app)
        .get(`/api/requisitions/${draftReqId}/approval-history`)
        .set(authHeader(hrManagerToken));
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.currentStatus).toBe('DRAFT');
      expect(data.currentPendingApprover).toBeNull();
      expect(data.history).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────
  // 7. Tính bất biến của lịch sử
  // ───────────────────────────────────────────
  describe('Tính bất biến của lịch sử phê duyệt', () => {
    it('Không có endpoint DELETE /approval-history (404 hoặc 405)', async () => {
      const res = await request(app)
        .delete(`/api/requisitions/${approvedReqId}/approval-history`)
        .set(authHeader(hrManagerToken));
      expect([404, 405]).toContain(res.status);
    });

    it('Không có endpoint PUT /approval-history (404 hoặc 405)', async () => {
      const res = await request(app)
        .put(`/api/requisitions/${approvedReqId}/approval-history`)
        .set(authHeader(hrManagerToken))
        .send({ notes: 'Cố tình sửa lịch sử' });
      expect([404, 405]).toContain(res.status);
    });

    it('Lịch sử không thay đổi khi gọi lại nhiều lần', async () => {
      const res1 = await request(app)
        .get(`/api/requisitions/${approvedReqId}/approval-history`)
        .set(authHeader(hrManagerToken));
      const res2 = await request(app)
        .get(`/api/requisitions/${approvedReqId}/approval-history`)
        .set(authHeader(hrManagerToken));
      expect(res1.body.data.history).toHaveLength(1);
      expect(res2.body.data.history).toHaveLength(1);
      expect(res1.body.data.history[0].id).toBe(res2.body.data.history[0].id);
    });
  });

  // ───────────────────────────────────────────
  // 8. Phạm vi dữ liệu (RBAC scope)
  // ───────────────────────────────────────────
  describe('Phạm vi dữ liệu (RBAC scope)', () => {
    it('HM phòng MKT không xem được lịch sử của requisition thuộc phòng HR', async () => {
      // pendingReqId thuộc HR dept, hmMktToken là hiring manager của MKT
      const res = await request(app)
        .get(`/api/requisitions/${pendingReqId}/approval-history`)
        .set(authHeader(hmMktToken));
      expect([403, 404]).toContain(res.status);
    });
  });
});
