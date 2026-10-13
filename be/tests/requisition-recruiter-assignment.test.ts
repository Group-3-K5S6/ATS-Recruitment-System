import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';
import { RoleType } from '../src/rbac/roles';

describe('SCRUM-97: BE-API phân công tuyển dụng (SCRUM-41)', () => {
  let adminToken: string;
  let adminUser: any;
  let hrManagerToken: string;
  let hrManagerUser: any;
  let hiringManagerToken: string;
  let hiringManagerUser: any;
  let approverToken: string;
  let approverUser: any;
  let recruiter1Token: string;
  let recruiter1User: any;
  let recruiter2Token: string;
  let recruiter2User: any;
  let candidateToken: string;

  let deactivatedRecruiterId: string;
  let nonRecruiterUserId: string;
  let testDepartmentId: string;
  let testJobTitleId: string;

  const createdRequisitionIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdCandidateIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    // 1. Đăng nhập các tài khoản mẫu
    const adminLogin = await loginAndGetToken('admin@ats.local');
    adminToken = adminLogin.token;
    adminUser = adminLogin.user;

    const hrLogin = await loginAndGetToken('hr_manager@ats.local');
    hrManagerToken = hrLogin.token;
    hrManagerUser = hrLogin.user;

    const hmLogin = await loginAndGetToken('hiring_manager_eng@ats.local');
    hiringManagerToken = hmLogin.token;
    hiringManagerUser = hmLogin.user;

    const approverLogin = await loginAndGetToken('approver@ats.local');
    approverToken = approverLogin.token;
    approverUser = approverLogin.user;

    const rec1Login = await loginAndGetToken('recruiter1@ats.local');
    recruiter1Token = rec1Login.token;
    recruiter1User = rec1Login.user;

    const rec2Login = await loginAndGetToken('recruiter2@ats.local');
    recruiter2Token = rec2Login.token;
    recruiter2User = rec2Login.user;

    const candLogin = await loginAndGetToken('candidate1@ats.local');
    candidateToken = candLogin.token;

    testDepartmentId = hiringManagerUser.departmentId;

    // 2. Tạo chức danh phục vụ kiểm thử
    const jobTitle = await prisma.jobTitle.create({
      data: {
        id: randomUUID(),
        code: `SCRUM97-${randomUUID().slice(0, 8)}`,
        name: 'Kỹ sư kiểm thử phần mềm SCRUM-97',
        level: 'Senior',
        minSalary: 20000000,
        maxSalary: 40000000,
      },
    });
    testJobTitleId = jobTitle.id;

    // 3. Tạo một Recruiter bị vô hiệu hóa (isActive = false) để test validation
    const recruiterRole = await prisma.role.findUnique({ where: { name: RoleType.RECRUITER } });
    const deactivatedUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `deactivated_recruiter_${randomUUID().slice(0, 6)}@ats.local`,
        fullName: 'Recruiter Đã Bị Vô Hiệu Hóa',
        passwordHash: 'Password123!',
        isActive: false,
        departmentId: testDepartmentId,
      },
    });
    createdUserIds.push(deactivatedUser.id);
    deactivatedRecruiterId = deactivatedUser.id;

    if (recruiterRole) {
      await prisma.userRole.create({
        data: {
          userId: deactivatedUser.id,
          roleId: recruiterRole.id,
        },
      });
    }

    // 4. Tạo một User bình thường không có role RECRUITER (chỉ có CANDIDATE)
    const candidateRole = await prisma.role.findUnique({ where: { name: RoleType.CANDIDATE } });
    const nonRecruiter = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `non_recruiter_${randomUUID().slice(0, 6)}@ats.local`,
        fullName: 'Người dùng không phải Recruiter',
        passwordHash: 'Password123!',
        isActive: true,
      },
    });
    createdUserIds.push(nonRecruiter.id);
    nonRecruiterUserId = nonRecruiter.id;

    if (candidateRole) {
      await prisma.userRole.create({
        data: {
          userId: nonRecruiter.id,
          roleId: candidateRole.id,
        },
      });
    }
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu kiểm thử
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
      await prisma.requisitionAssignmentHistory.deleteMany({
        where: { requisitionId: { in: createdRequisitionIds } },
      });
      await prisma.requisitionSupportingRecruiter.deleteMany({
        where: { requisitionId: { in: createdRequisitionIds } },
      });
      await prisma.requisitionApprovalHistory.deleteMany({
        where: { requisitionId: { in: createdRequisitionIds } },
      });
      await prisma.requisition.deleteMany({
        where: { id: { in: createdRequisitionIds } },
      });
    }

    if (createdUserIds.length > 0) {
      await prisma.userRole.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

    if (testJobTitleId) {
      await prisma.jobTitle.deleteMany({
        where: { id: testJobTitleId },
      });
    }
  });

  // Helper tạo Requisition độc lập
  async function createTestRequisition(customData: any = {}) {
    const req = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: customData.title || `Yêu cầu tuyển dụng SCRUM-97 ${randomUUID().slice(0, 6)}`,
        departmentId: testDepartmentId,
        jobTitleId: testJobTitleId,
        hiringManagerId: hiringManagerUser.id,
        approverId: approverUser.id,
        leadRecruiterId: customData.leadRecruiterId || null,
        headcount: 2,
        budget: 35000000,
        status: customData.status || 'APPROVED',
        reason: 'NEW',
        proposedSalaryMin: 20000000,
        proposedSalaryMax: 35000000,
      },
    });
    createdRequisitionIds.push(req.id);
    return req;
  }

  // =========================================================================
  // TIÊU CHÍ 1: Phân chia một nhà tuyển dụng chính và nhiều nhà tuyển dụng hỗ trợ
  // =========================================================================
  describe('Tiêu chí 1: Phân chia một nhà tuyển dụng chính và nhiều nhà tuyển dụng hỗ trợ', () => {
    it('1.1 HR Manager phân công thành công 1 nhà tuyển dụng chính và nhà tuyển dụng hỗ trợ', async () => {
      const req = await createTestRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({
          leadRecruiterId: recruiter1User.id,
          supportingRecruiterIds: [recruiter2User.id],
          notes: 'Phân công chiến dịch tuyển dụng Q4 cho Recruiter One và Recruiter Two hỗ trợ',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.leadRecruiterId).toBe(recruiter1User.id);
      expect(res.body.data.leadRecruiter.id).toBe(recruiter1User.id);
      expect(res.body.data.supportingRecruiters).toHaveLength(1);
      expect(res.body.data.supportingRecruiters[0].recruiter.id).toBe(recruiter2User.id);
    });

    it('1.2 Admin cũng có thẩm quyền phân công nhà tuyển dụng', async () => {
      const req = await createTestRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/assign-recruiters`)
        .set(authHeader(adminToken))
        .send({
          leadRecruiterId: recruiter2User.id,
          supportingRecruiterIds: [recruiter1User.id],
          notes: 'Admin phân công trực tiếp',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.leadRecruiterId).toBe(recruiter2User.id);
      expect(res.body.data.supportingRecruiters).toHaveLength(1);
    });

    it('1.3 Từ chối (403 FORBIDDEN_SCOPE) khi các vai trò không có thẩm quyền cố phân công', async () => {
      const req = await createTestRequisition();

      // Hiring Manager bị từ chối
      const resHM = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hiringManagerToken))
        .send({ leadRecruiterId: recruiter1User.id });
      expect(resHM.status).toBe(403);
      expect(resHM.body.error.code).toBe('FORBIDDEN_SCOPE');

      // Recruiter tự gán hoặc gán người khác bị từ chối
      const resRec = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(recruiter1Token))
        .send({ leadRecruiterId: recruiter1User.id });
      expect(resRec.status).toBe(403);
      expect(resRec.body.error.code).toBe('FORBIDDEN_SCOPE');

      // Approver bị từ chối
      const resApp = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(approverToken))
        .send({ leadRecruiterId: recruiter1User.id });
      expect(resApp.status).toBe(403);
      expect(['FORBIDDEN_SCOPE', 'FORBIDDEN_PERMISSION']).toContain(resApp.body.error.code);

      // Candidate bị từ chối
      const resCand = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(candidateToken))
        .send({ leadRecruiterId: recruiter1User.id });
      expect(resCand.status).toBe(403);
      expect(['FORBIDDEN_SCOPE', 'FORBIDDEN_PERMISSION']).toContain(resCand.body.error.code);
    });

    it('1.4 Từ chối (400 INVALID_RECRUITER) nếu nhà tuyển dụng chính không hợp lệ hoặc bị khóa', async () => {
      const req = await createTestRequisition();

      // Gán recruiter ID không tồn tại
      const resNotExist = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({ leadRecruiterId: randomUUID() });
      expect(resNotExist.status).toBe(400);
      expect(resNotExist.body.error.code).toBe('INVALID_RECRUITER');

      // Gán user bị vô hiệu hóa (isActive = false)
      const resDeactivated = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({ leadRecruiterId: deactivatedRecruiterId });
      expect(resDeactivated.status).toBe(400);
      expect(resDeactivated.body.error.code).toBe('INVALID_RECRUITER');

      // Gán user không có vai trò RECRUITER
      const resNonRecruiter = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({ leadRecruiterId: nonRecruiterUserId });
      expect(resNonRecruiter.status).toBe(400);
      expect(resNonRecruiter.body.error.code).toBe('INVALID_RECRUITER');
    });

    it('1.5 Từ chối (400 DUPLICATE_RECRUITER) nếu nhà tuyển dụng chính đồng thời là nhà tuyển dụng hỗ trợ', async () => {
      const req = await createTestRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({
          leadRecruiterId: recruiter1User.id,
          supportingRecruiterIds: [recruiter1User.id, recruiter2User.id],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DUPLICATE_RECRUITER');
    });

    it('1.6 Từ chối (400 INVALID_SUPPORTING_RECRUITER) nếu nhà tuyển dụng hỗ trợ không hợp lệ', async () => {
      const req = await createTestRequisition();

      const res = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({
          leadRecruiterId: recruiter1User.id,
          supportingRecruiterIds: [deactivatedRecruiterId],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SUPPORTING_RECRUITER');
    });

    it('1.7 Báo lỗi 404 NOT_FOUND khi phân công cho Requisition không tồn tại', async () => {
      const fakeId = randomUUID();
      const res = await request(app)
        .post(`/api/requisitions/${fakeId}/assign`)
        .set(authHeader(hrManagerToken))
        .send({ leadRecruiterId: recruiter1User.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('1.8 HR Manager có thể gán nhà tuyển dụng ngay khi tạo yêu cầu tuyển dụng (POST /api/requisitions)', async () => {
      const res = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrManagerToken))
        .send({
          title: `Requisition Tạo Kèm Recruiter ${randomUUID().slice(0, 6)}`,
          departmentId: testDepartmentId,
          jobTitleId: testJobTitleId,
          headcount: 2,
          isDraft: true,
          leadRecruiterId: recruiter1User.id,
          supportingRecruiterIds: [recruiter2User.id],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.leadRecruiterId).toBe(recruiter1User.id);
      createdRequisitionIds.push(res.body.data.id);

      // Kiểm tra có tạo bản ghi ASSIGN trong lịch sử
      const historyRes = await request(app)
        .get(`/api/requisitions/${res.body.data.id}/assignment-history`)
        .set(authHeader(hrManagerToken));

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data).toHaveLength(1);
      expect(historyRes.body.data[0].action).toBe('ASSIGN');
      expect(historyRes.body.data[0].newLeadRecruiter.id).toBe(recruiter1User.id);
    });

    it('1.9 HR Manager có thể cập nhật người phụ trách qua PUT /api/requisitions/:id và ghi nhận HANDOVER', async () => {
      const req = await createTestRequisition({ leadRecruiterId: recruiter1User.id, status: 'DRAFT' });

      const res = await request(app)
        .put(`/api/requisitions/${req.id}`)
        .set(authHeader(hrManagerToken))
        .send({
          leadRecruiterId: recruiter2User.id,
          supportingRecruiterIds: [recruiter1User.id],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.leadRecruiterId).toBe(recruiter2User.id);

      const historyRes = await request(app)
        .get(`/api/requisitions/${req.id}/assignment-history`)
        .set(authHeader(hrManagerToken));

      expect(historyRes.status).toBe(200);
      const handoverItem = historyRes.body.data.find((h: any) => h.action === 'HANDOVER');
      expect(handoverItem).toBeDefined();
      expect(handoverItem.previousLeadRecruiter.id).toBe(recruiter1User.id);
      expect(handoverItem.newLeadRecruiter.id).toBe(recruiter2User.id);
    });

    it('1.10 Hiring Manager bị từ chối 403 FORBIDDEN_SCOPE khi cố thay đổi người phụ trách qua PUT /api/requisitions/:id', async () => {
      const req = await createTestRequisition({ leadRecruiterId: recruiter1User.id, status: 'DRAFT' });

      const res = await request(app)
        .put(`/api/requisitions/${req.id}`)
        .set(authHeader(hiringManagerToken))
        .send({
          leadRecruiterId: recruiter2User.id,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });
  });

  // =========================================================================
  // TIÊU CHÍ 2: Có ghi lịch sử chuyển giao khi đổi người phụ trách
  // =========================================================================
  describe('Tiêu chí 2: Có ghi lịch sử chuyển giao khi đổi người phụ trách', () => {
    it('2.1 Phân công lần đầu ghi nhận lịch sử với hành động ASSIGN', async () => {
      const req = await createTestRequisition();

      await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({
          leadRecruiterId: recruiter1User.id,
          supportingRecruiterIds: [recruiter2User.id],
          notes: 'Khởi tạo phân công tuyển dụng ban đầu',
        });

      const historyRes = await request(app)
        .get(`/api/requisitions/${req.id}/assignment-history`)
        .set(authHeader(hrManagerToken));

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data).toHaveLength(1);

      const item = historyRes.body.data[0];
      expect(item.action).toBe('ASSIGN');
      expect(item.previousLeadRecruiter).toBeNull();
      expect(item.newLeadRecruiter.id).toBe(recruiter1User.id);
      expect(item.actor.id).toBe(hrManagerUser.id);
      expect(item.notes).toBe('Khởi tạo phân công tuyển dụng ban đầu');
      expect(item.supportingRecruiters).toHaveLength(1);
      expect(item.supportingRecruiters[0].id).toBe(recruiter2User.id);
    });

    it('2.2 Đổi người phụ trách chính ghi nhận lịch sử chuyển giao HANDOVER', async () => {
      const req = await createTestRequisition();

      // Phân công lần 1: Recruiter One
      await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({
          leadRecruiterId: recruiter1User.id,
          notes: 'Phân công Recruiter 1 chạy giai đoạn 1',
        });

      // Phân công lần 2: Đổi sang Recruiter Two phụ trách chính (Bàn giao)
      const handoverRes = await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({
          leadRecruiterId: recruiter2User.id,
          supportingRecruiterIds: [recruiter1User.id],
          notes: 'Chuyển giao vị trí cho Recruiter 2 do Recruiter 1 chuyển dự án',
        });

      expect(handoverRes.status).toBe(200);
      expect(handoverRes.body.data.leadRecruiterId).toBe(recruiter2User.id);

      // Kiểm tra danh sách lịch sử chuyển giao
      const historyRes = await request(app)
        .get(`/api/requisitions/${req.id}/assignment-history`)
        .set(authHeader(hrManagerToken));

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data).toHaveLength(2);

      const latestHandover = historyRes.body.data[0];
      expect(latestHandover.action).toBe('HANDOVER');
      expect(latestHandover.previousLeadRecruiter.id).toBe(recruiter1User.id);
      expect(latestHandover.newLeadRecruiter.id).toBe(recruiter2User.id);
      expect(latestHandover.notes).toBe('Chuyển giao vị trí cho Recruiter 2 do Recruiter 1 chuyển dự án');
      expect(latestHandover.supportingRecruiters[0].id).toBe(recruiter1User.id);
    });

    it('2.3 Cập nhật danh sách hỗ trợ giữ nguyên người chính ghi nhận UPDATE_SUPPORTING', async () => {
      const req = await createTestRequisition();

      // Lần 1: Lead recruiter 1, không có hỗ trợ
      await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({ leadRecruiterId: recruiter1User.id });

      // Lần 2: Giữ Lead recruiter 1, thêm recruiter 2 hỗ trợ
      await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({
          leadRecruiterId: recruiter1User.id,
          supportingRecruiterIds: [recruiter2User.id],
          notes: 'Bổ sung thêm Recruiter 2 làm hỗ trợ',
        });

      const historyRes = await request(app)
        .get(`/api/requisitions/${req.id}/handover-history`)
        .set(authHeader(hrManagerToken));

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data[0].action).toBe('UPDATE_SUPPORTING');
      expect(historyRes.body.data[0].notes).toBe('Bổ sung thêm Recruiter 2 làm hỗ trợ');
    });

    it('2.4 Ghi nhận đúng AuditLog trong cơ sở dữ liệu khi phân công và chuyển giao', async () => {
      const req = await createTestRequisition();

      await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({ leadRecruiterId: recruiter1User.id });

      await request(app)
        .post(`/api/requisitions/${req.id}/assign`)
        .set(authHeader(hrManagerToken))
        .send({ leadRecruiterId: recruiter2User.id, notes: 'Chuyển giao cho Recruiter 2' });

      const logs = await prisma.auditLog.findMany({
        where: {
          resourceType: 'requisition',
          resourceId: req.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      const assignLog = logs.find((l) => l.action === 'REQUISITION_ASSIGNED');
      const handoverLog = logs.find((l) => l.action === 'REQUISITION_HANDOVER');

      expect(assignLog).toBeDefined();
      expect(handoverLog).toBeDefined();
      expect(handoverLog?.actorId).toBe(hrManagerUser.id);
    });
  });

  // =========================================================================
  // TIÊU CHÍ 3: Nhà tuyển dụng chỉ tìm kiếm ứng dụng của vị trí được giao
  // =========================================================================
  describe('Tiêu chí 3: Nhà tuyển dụng chỉ tìm kiếm ứng dụng của vị trí được giao', () => {
    let reqEngAssignedToRec1: any;
    let reqMktAssignedToRec2: any;
    let jobEng: any;
    let jobMkt: any;
    let candEng: any;
    let candMkt: any;
    let appEng: any;
    let appMkt: any;

    beforeAll(async () => {
      // 1. Tạo Requisition 1 cho ENG, phân công Recruiter 1
      reqEngAssignedToRec1 = await createTestRequisition({
        title: `Tuyển Senior QA Engineer SCRUM-97 ${randomUUID().slice(0, 6)}`,
        leadRecruiterId: recruiter1User.id,
      });

      // Tạo Requisition 2 cho MKT, phân công Recruiter 2
      reqMktAssignedToRec2 = await createTestRequisition({
        title: `Tuyển Marketing Executive SCRUM-97 ${randomUUID().slice(0, 6)}`,
        leadRecruiterId: recruiter2User.id,
      });

      // 2. Tạo Job cho Requisition 1
      jobEng = await prisma.job.create({
        data: {
          id: randomUUID(),
          title: 'Senior QA Engineer (Automation)',
          requisitionId: reqEngAssignedToRec1.id,
          departmentId: testDepartmentId,
          hiringManagerId: hiringManagerUser.id,
          recruiterId: recruiter1User.id,
          jobTitleId: testJobTitleId,
          status: 'PUBLISHED',
          description: 'Kiểm thử tự động hệ thống ATS',
          location: 'Hanoi',
        },
      });
      createdJobIds.push(jobEng.id);

      // Tạo Job cho Requisition 2
      jobMkt = await prisma.job.create({
        data: {
          id: randomUUID(),
          title: 'Marketing Content Creator',
          requisitionId: reqMktAssignedToRec2.id,
          departmentId: testDepartmentId,
          hiringManagerId: hiringManagerUser.id,
          recruiterId: recruiter2User.id,
          jobTitleId: testJobTitleId,
          status: 'PUBLISHED',
          description: 'Sáng tạo nội dung truyền thông',
          location: 'Hanoi',
        },
      });
      createdJobIds.push(jobMkt.id);

      // 3. Tạo ứng viên 1 nộp vào Job ENG
      candEng = await prisma.candidate.create({
        data: {
          id: randomUUID(),
          fullName: `Ứng Viên QA ENG ${randomUUID().slice(0, 4)}`,
          email: `qa_cand_${randomUUID().slice(0, 6)}@test.com`,
          phone: '0981112233',
        },
      });
      createdCandidateIds.push(candEng.id);

      appEng = await prisma.application.create({
        data: {
          id: randomUUID(),
          candidateId: candEng.id,
          jobId: jobEng.id,
          stage: 'SCREENING',
          status: 'ACTIVE',
          assignedRecruiterId: recruiter1User.id,
        },
      });
      createdApplicationIds.push(appEng.id);

      // Tạo ứng viên 2 nộp vào Job MKT
      candMkt = await prisma.candidate.create({
        data: {
          id: randomUUID(),
          fullName: `Ứng Viên Content MKT ${randomUUID().slice(0, 4)}`,
          email: `mkt_cand_${randomUUID().slice(0, 6)}@test.com`,
          phone: '0973334455',
        },
      });
      createdCandidateIds.push(candMkt.id);

      appMkt = await prisma.application.create({
        data: {
          id: randomUUID(),
          candidateId: candMkt.id,
          jobId: jobMkt.id,
          stage: 'APPLIED',
          status: 'ACTIVE',
          assignedRecruiterId: recruiter2User.id,
        },
      });
      createdApplicationIds.push(appMkt.id);
    });

    it('3.1 Recruiter xem được Requisition và danh sách đơn ứng tuyển thuộc vị trí được giao', async () => {
      // Recruiter 1 xem Requisition 1 được giao -> 200
      const resReq = await request(app)
        .get(`/api/requisitions/${reqEngAssignedToRec1.id}`)
        .set(authHeader(recruiter1Token));
      expect(resReq.status).toBe(200);
      expect(resReq.body.data.id).toBe(reqEngAssignedToRec1.id);

      // Recruiter 1 xem danh sách applications của Requisition 1 -> 200
      const resApps = await request(app)
        .get(`/api/requisitions/${reqEngAssignedToRec1.id}/applications`)
        .set(authHeader(recruiter1Token));
      expect(resApps.status).toBe(200);
      expect(resApps.body.data).toHaveLength(1);
      expect(resApps.body.data[0].id).toBe(appEng.id);
      expect(resApps.body.data[0].candidate.fullName).toBe(candEng.fullName);
    });

    it('3.2 Recruiter bị từ chối (403 FORBIDDEN_SCOPE) khi truy cập Requisition ngoài phạm vi được phân công', async () => {
      // Recruiter 1 cố xem Requisition 2 (thuộc Recruiter 2) -> 403
      const resReq = await request(app)
        .get(`/api/requisitions/${reqMktAssignedToRec2.id}`)
        .set(authHeader(recruiter1Token));
      expect(resReq.status).toBe(403);
      expect(resReq.body.error.code).toBe('FORBIDDEN_SCOPE');

      // Recruiter 1 cố xem danh sách applications của Requisition 2 -> 403
      const resApps = await request(app)
        .get(`/api/requisitions/${reqMktAssignedToRec2.id}/applications`)
        .set(authHeader(recruiter1Token));
      expect(resApps.status).toBe(403);
      expect(resApps.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('3.3 Recruiter tìm kiếm ứng dụng (GET /api/applications) CHỈ thấy hồ sơ thuộc vị trí được giao', async () => {
      // Recruiter 1 gọi GET /api/applications: chỉ thấy ứng viên của jobEng, không thấy jobMkt
      const res = await request(app)
        .get('/api/applications')
        .set(authHeader(recruiter1Token));

      expect(res.status).toBe(200);
      const appIds = res.body.data.map((a: any) => a.id);
      expect(appIds).toContain(appEng.id);
      expect(appIds).not.toContain(appMkt.id);

      // Tìm kiếm theo từ khóa ứng viên của Job MKT -> không ra kết quả
      const resSearchForeign = await request(app)
        .get(`/api/applications?q=${encodeURIComponent(candMkt.fullName)}`)
        .set(authHeader(recruiter1Token));
      expect(resSearchForeign.status).toBe(200);
      const searchIds = resSearchForeign.body.data.map((a: any) => a.id);
      expect(searchIds).not.toContain(appMkt.id);

      // Tìm kiếm theo từ khóa ứng viên của Job ENG -> tìm thấy đúng
      const resSearchOwn = await request(app)
        .get(`/api/applications?q=${encodeURIComponent(candEng.fullName)}`)
        .set(authHeader(recruiter1Token));
      expect(resSearchOwn.status).toBe(200);
      expect(resSearchOwn.body.data.some((a: any) => a.id === appEng.id)).toBe(true);
    });

    it('3.4 Recruiter bị chặn (403 FORBIDDEN_SCOPE) khi xem chi tiết application ngoài phạm vi', async () => {
      // Recruiter 1 xem hồ sơ đơn của mình -> 200
      const resOwn = await request(app)
        .get(`/api/applications/${appEng.id}`)
        .set(authHeader(recruiter1Token));
      expect(resOwn.status).toBe(200);

      // Recruiter 1 xem hồ sơ đơn của Recruiter 2 -> 403
      const resForeign = await request(app)
        .get(`/api/applications/${appMkt.id}`)
        .set(authHeader(recruiter1Token));
      expect(resForeign.status).toBe(403);
      expect(resForeign.body.error.code).toBe('FORBIDDEN_SCOPE');
    });

    it('3.5 HR Manager và Admin vẫn xem được toàn bộ applications xuyên suốt các vị trí', async () => {
      const resHR = await request(app)
        .get('/api/applications')
        .set(authHeader(hrManagerToken));
      expect(resHR.status).toBe(200);
      const hrAppIds = resHR.body.data.map((a: any) => a.id);
      expect(hrAppIds).toContain(appEng.id);
      expect(hrAppIds).toContain(appMkt.id);

      const resAdmin = await request(app)
        .get('/api/applications')
        .set(authHeader(adminToken));
      expect(resAdmin.status).toBe(200);
      const adminAppIds = resAdmin.body.data.map((a: any) => a.id);
      expect(adminAppIds).toContain(appEng.id);
      expect(adminAppIds).toContain(appMkt.id);
    });
  });
});
