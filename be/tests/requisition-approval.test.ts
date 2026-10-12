import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

describe('SCRUM-89: BE-API xử lý phê duyệt (SCRUM-37)', () => {
  let adminToken: string;
  let adminUser: any;
  let hrManagerToken: string;
  let hrManagerUser: any;
  let approverToken: string;
  let approverUser: any;
  let hiringManagerToken: string;
  let hiringManagerUser: any;
  let recruiterToken: string;

  let testDepartmentId: string;
  let testJobTitleId: string;
  const createdRequisitionIds: string[] = [];

  beforeAll(async () => {
    // 1. Lấy token các tài khoản thực tế
    const adminLogin = await loginAndGetToken('admin@ats.local');
    adminToken = adminLogin.token;
    adminUser = adminLogin.user;

    const hrLogin = await loginAndGetToken('hr_manager@ats.local');
    hrManagerToken = hrLogin.token;
    hrManagerUser = hrLogin.user;

    const approverLogin = await loginAndGetToken('approver@ats.local');
    approverToken = approverLogin.token;
    approverUser = approverLogin.user;

    const hmLogin = await loginAndGetToken('hiring_manager_eng@ats.local');
    hiringManagerToken = hmLogin.token;
    hiringManagerUser = hmLogin.user;

    const recruiterLogin = await loginAndGetToken('recruiter1@ats.local');
    recruiterToken = recruiterLogin.token;

    testDepartmentId = hiringManagerUser.departmentId;

    // 2. Tạo chức danh cho bài test
    const jobTitle = await prisma.jobTitle.create({
      data: {
        id: randomUUID(),
        code: `SCRUM89-${randomUUID().slice(0, 8)}`,
        name: 'Kỹ sư phần mềm SCRUM-89',
        level: 'Senior',
        minSalary: 20000000,
        maxSalary: 50000000,
      },
    });
    testJobTitleId = jobTitle.id;
  });

  afterAll(async () => {
    if (createdRequisitionIds.length > 0) {
      await prisma.requisitionApprovalHistory.deleteMany({
        where: { requisitionId: { in: createdRequisitionIds } },
      });
      await prisma.requisition.deleteMany({
        where: { id: { in: createdRequisitionIds } },
      });
    }

    if (testJobTitleId) {
      await prisma.jobTitle.deleteMany({
        where: { id: testJobTitleId },
      });
    }
  });

  // Helper tạo Requisition PENDING_APPROVAL
  async function createPendingRequisition(customData: any = {}) {
    const req = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: customData.title || `Yêu cầu tuyển dụng SCRUM-89 ${randomUUID().slice(0, 6)}`,
        departmentId: testDepartmentId,
        jobTitleId: testJobTitleId,
        hiringManagerId: hiringManagerUser.id,
        approverId: customData.approverId || approverUser.id,
        headcount: 2,
        budget: customData.budget || 30000000,
        status: customData.status || 'PENDING_APPROVAL',
        approvalChain: customData.approvalChain ?? null,
        reason: customData.reason || 'NEW',
        proposedSalaryMin: customData.proposedSalaryMin || 25000000,
        proposedSalaryMax: customData.proposedSalaryMax || 35000000,
        targetDate: customData.targetDate || new Date(Date.now() + 30 * 86400000),
        description: customData.description || 'Mô tả tuyển dụng kỹ sư phần mềm SCRUM-89',
        requirements: customData.requirements || 'Yêu cầu 3+ năm kinh nghiệm TypeScript, NodeJS',
      },
    });
    createdRequisitionIds.push(req.id);
    return req;
  }

  describe('Tiêu chí 1 & 2: 3 Hành động phê duyệt & Bắt buộc ý kiến/lý do', () => {
    it('Duyệt thành công (APPROVE) với ý kiến tùy chọn (không bắt buộc)', async () => {
      const req = await createPendingRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/approve`)
        .set(authHeader(approverToken))
        .send({
          decision: 'APPROVE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('APPROVED');

      // Kiểm tra lịch sử bất biến được ghi nhận
      const historyRes = await request(app)
        .get(`/api/requisitions/${req.id}/approval-history`)
        .set(authHeader(approverToken));

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data.history).toHaveLength(1);
      expect(historyRes.body.data.history[0].decision).toBe('APPROVE');
      expect(historyRes.body.data.history[0].fromStatus).toBe('PENDING_APPROVAL');
      expect(historyRes.body.data.history[0].toStatus).toBe('APPROVED');
    });

    it('Từ chối (REJECT) bắt buộc phải có ý kiến/lý do - trả về 400 nếu bỏ trống', async () => {
      const req = await createPendingRequisition();

      // Gửi rỗng hoặc khoảng trắng
      const resWithoutNotes = await request(app)
        .post(`/api/requisitions/${req.id}/reject`)
        .set(authHeader(approverToken))
        .send({
          notes: '   ',
        });

      expect(resWithoutNotes.status).toBe(400);
      expect(resWithoutNotes.body.error.code).toBe('VALIDATION_ERROR');

      // Gửi có lý do đầy đủ
      const resWithNotes = await request(app)
        .post(`/api/requisitions/${req.id}/reject`)
        .set(authHeader(approverToken))
        .send({
          notes: 'Ngân sách không đủ cho quý này, đề nghị dời sang quý sau.',
        });

      expect(resWithNotes.status).toBe(200);
      expect(resWithNotes.body.data.status).toBe('REJECTED');

      // Lịch sử ghi nhận đúng lý do
      const historyRes = await request(app)
        .get(`/api/requisitions/${req.id}/approval-history`)
        .set(authHeader(approverToken));

      expect(historyRes.body.data.history).toHaveLength(1);
      expect(historyRes.body.data.history[0].decision).toBe('REJECT');
      expect(historyRes.body.data.history[0].notes).toBe(
        'Ngân sách không đủ cho quý này, đề nghị dời sang quý sau.'
      );
    });

    it('Yêu cầu bổ sung (REQUEST_CHANGES) bắt buộc phải có ý kiến/lý do - trả về 400 nếu thiếu', async () => {
      const req = await createPendingRequisition();

      const resMissing = await request(app)
        .post(`/api/requisitions/${req.id}/request-changes`)
        .set(authHeader(approverToken))
        .send({});

      expect(resMissing.status).toBe(400);
      expect(resMissing.body.error.code).toBe('VALIDATION_ERROR');

      const resSuccess = await request(app)
        .post(`/api/requisitions/${req.id}/request-changes`)
        .set(authHeader(approverToken))
        .send({
          comment: 'Cần bổ sung bảng mô tả công việc (JD) chi tiết hơn.',
        });

      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.data.status).toBe('CHANGES_REQUESTED');

      // Verify trạng thái và lịch sử
      const historyRes = await request(app)
        .get(`/api/requisitions/${req.id}/approval-history`)
        .set(authHeader(approverToken));

      expect(historyRes.body.data.currentStatus).toBe('CHANGES_REQUESTED');
      expect(historyRes.body.data.history[0].decision).toBe('REQUEST_CHANGES');
      expect(historyRes.body.data.history[0].notes).toBe(
        'Cần bổ sung bảng mô tả công việc (JD) chi tiết hơn.'
      );
    });

    it('Hỗ trợ alias REQUEST_ADDITIONAL_INFO tương đương REQUEST_CHANGES', async () => {
      const req = await createPendingRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/approve`)
        .set(authHeader(approverToken))
        .send({
          decision: 'REQUEST_ADDITIONAL_INFO',
          reason: 'Cần cung cấp thêm dự toán ngân sách.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CHANGES_REQUESTED');
    });
  });

  describe('Tiêu chí 3: Luồng phê duyệt tuần tự nhiều cấp', () => {
    it('Chuyển tuần tự qua các cấp duyệt và chỉ hoàn tất khi cấp cuối phê duyệt', async () => {
      // Giả lập luồng 2 cấp: Cấp 1 (approverUser), Cấp 2 (hrManagerUser)
      const chain = [
        { step: 1, approverId: approverUser.id, status: 'PENDING' },
        { step: 2, approverId: hrManagerUser.id, status: 'WAITING' },
      ];

      const req = await createPendingRequisition({
        approverId: approverUser.id,
        approvalChain: JSON.stringify(chain),
      });

      // 1. Cấp 1 duyệt -> Requisition vẫn là PENDING_APPROVAL, approverId chuyển sang cấp 2
      const step1Res = await request(app)
        .post(`/api/requisitions/${req.id}/approve`)
        .set(authHeader(approverToken))
        .send({ notes: 'Đồng ý bước 1.' });

      expect(step1Res.status).toBe(200);
      expect(step1Res.body.data.status).toBe('PENDING_APPROVAL');
      expect(step1Res.body.data.approverId).toBe(hrManagerUser.id);

      const updatedChain = JSON.parse(step1Res.body.data.approvalChain);
      expect(updatedChain[0].status).toBe('APPROVED');
      expect(updatedChain[1].status).toBe('PENDING');

      // 2. Cấp 2 duyệt -> Cấp cuối duyệt xong, trạng thái chuyển thành APPROVED
      const step2Res = await request(app)
        .post(`/api/requisitions/${req.id}/approve`)
        .set(authHeader(hrManagerToken))
        .send({ notes: 'Phê duyệt cuối cùng.' });

      expect(step2Res.status).toBe(200);
      expect(step2Res.body.data.status).toBe('APPROVED');

      // 3. Kiểm tra toàn bộ lịch sử 2 bước
      const historyRes = await request(app)
        .get(`/api/requisitions/${req.id}/approval-history`)
        .set(authHeader(adminToken));

      expect(historyRes.body.data.history).toHaveLength(2);
      expect(historyRes.body.data.history[0].step).toBe(1);
      expect(historyRes.body.data.history[0].decision).toBe('APPROVE');
      expect(historyRes.body.data.history[1].step).toBe(2);
      expect(historyRes.body.data.history[1].decision).toBe('APPROVE');
      expect(historyRes.body.data.history[1].toStatus).toBe('APPROVED');
    });

    it('Từ chối ở cấp 2 lập tức chuyển trạng thái sang REJECTED', async () => {
      const chain = [
        { step: 1, approverId: approverUser.id, status: 'APPROVED' },
        { step: 2, approverId: hrManagerUser.id, status: 'PENDING' },
      ];

      const req = await createPendingRequisition({
        approverId: hrManagerUser.id,
        approvalChain: JSON.stringify(chain),
      });

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/reject`)
        .set(authHeader(hrManagerToken))
        .send({ notes: 'Không đồng ý ở cấp 2.' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
    });
  });

  describe('Tiêu chí 4: Quy trình Yêu cầu bổ sung (Request Changes) & Nộp lại hồ sơ', () => {
    it('Khi yêu cầu bổ sung, bảo lưu cấp duyệt đầu và cho phép người tạo cập nhật, nộp lại mà không mất lịch sử', async () => {
      const chain = [
        { step: 1, approverId: approverUser.id, status: 'PENDING' },
        { step: 2, approverId: hrManagerUser.id, status: 'WAITING' },
      ];

      const req = await createPendingRequisition({
        approverId: approverUser.id,
        approvalChain: JSON.stringify(chain),
      });

      // 1. Cấp 1 bấm Yêu cầu bổ sung
      const changeRes = await request(app)
        .post(`/api/requisitions/${req.id}/request-changes`)
        .set(authHeader(approverToken))
        .send({ notes: 'Vui lòng tăng ngân sách dự kiến.' });

      expect(changeRes.status).toBe(200);
      expect(changeRes.body.data.status).toBe('CHANGES_REQUESTED');
      // Bảo lưu approver cấp đầu
      expect(changeRes.body.data.approverId).toBe(approverUser.id);

      // 2. Người tạo (Hiring Manager) cập nhật lại thông tin và nộp lại
      const updateRes = await request(app)
        .put(`/api/requisitions/${req.id}`)
        .set(authHeader(hiringManagerToken))
        .send({
          title: 'Yêu cầu tuyển dụng đã cập nhật ngân sách',
          budget: 45000000,
          isDraft: false,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('PENDING_APPROVAL');

      // 3. Toàn bộ lịch sử trước đó không bị mất
      const historyRes = await request(app)
        .get(`/api/requisitions/${req.id}/approval-history`)
        .set(authHeader(hiringManagerToken));

      expect(historyRes.body.data.history.length).toBeGreaterThanOrEqual(1);
      expect(historyRes.body.data.history[0].decision).toBe('REQUEST_CHANGES');
      expect(historyRes.body.data.history[0].notes).toBe('Vui lòng tăng ngân sách dự kiến.');
    });
  });

  describe('Tiêu chí 5: Tính bất biến của lịch sử & Ràng buộc bảo mật RBAC', () => {
    it('Lịch sử là bất biến (Read-only): Không có API cập nhật/xóa lịch sử phê duyệt', async () => {
      const req = await createPendingRequisition();

      await request(app)
        .post(`/api/requisitions/${req.id}/approve`)
        .set(authHeader(approverToken))
        .send();

      // Kiểm tra route PUT và DELETE không tồn tại (404/405)
      const putRes = await request(app)
        .put(`/api/requisitions/${req.id}/approval-history`)
        .set(authHeader(adminToken))
        .send({ notes: 'Hack history' });

      expect(putRes.status).toBe(404);

      const delRes = await request(app)
        .delete(`/api/requisitions/${req.id}/approval-history`)
        .set(authHeader(adminToken));

      expect(delRes.status).toBe(404);
    });

    it('Chặn phê duyệt khi yêu cầu đã ở trạng thái kết thúc (APPROVED / REJECTED)', async () => {
      const req = await createPendingRequisition({ status: 'APPROVED' });

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/approve`)
        .set(authHeader(approverToken))
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS');
    });

    it('Người dùng không được phân công duyệt không thể thực hiện phê duyệt (403)', async () => {
      // Requisition được gán cho admin duyệt, approver thông thường không được phân công
      const req = await createPendingRequisition({ approverId: adminUser.id });

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/approve`)
        .set(authHeader(approverToken))
        .send();

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('Ghi nhận đúng Audit Log khi duyệt, từ chối, yêu cầu bổ sung', async () => {
      const req = await createPendingRequisition();

      await request(app)
        .post(`/api/requisitions/${req.id}/approve`)
        .set(authHeader(approverToken))
        .send({ notes: 'Audit test' });

      const audit = await prisma.auditLog.findFirst({
        where: {
          resourceId: req.id,
          action: 'REQUISITION_APPROVED',
        },
      });

      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(approverUser.id);
    });
  });
});
