import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';
import { RoleType } from '../src/rbac/roles';
import { hashPassword } from '../src/utils/password';

describe('SCRUM-87: API cấu hình luồng phê duyệt & Tích hợp Requisition', () => {
  let hrToken: string;
  let adminToken: string;
  let recruiterToken: string;
  let candidateToken: string;

  let testDeptId: string;
  let testDept3Id: string;
  let testDeptActiveId: string;
  let testJobTitleId: string;

  let approver1: any;
  let approver2: any;
  let approver3: any;
  let inactiveApprover: any;
  let dualRoleUser: any;
  let adminUser: any;
  let hrUser: any;
  const extraUserIds: string[] = [];

  beforeAll(async () => {
    // 1. Lấy token cho các vai trò
    const hrLogin = await loginAndGetToken('hr_manager@ats.local');
    hrToken = hrLogin.token;

    const adminLogin = await loginAndGetToken('admin@ats.local');
    adminToken = adminLogin.token;

    const recruiterLogin = await loginAndGetToken('recruiter1@ats.local');
    recruiterToken = recruiterLogin.token;

    const candidateLogin = await loginAndGetToken('candidate1@ats.local');
    candidateToken = candidateLogin.token;

    // 2. Tạo phòng ban riêng để test không ảnh hưởng dữ liệu khác
    const testDept = await prisma.department.create({
      data: {
        id: randomUUID(),
        name: `Phòng ban Test S3-01 ${randomUUID().slice(0, 6)}`,
        code: `DEPT-S301-${randomUUID().slice(0, 6)}`,
      },
    });
    testDeptId = testDept.id;

    // Phòng ban riêng cho Tiêu chí 3 (Validation)
    const testDept3 = await prisma.department.create({
      data: {
        id: randomUUID(),
        name: `Phòng ban Test S3-01 Validation ${randomUUID().slice(0, 6)}`,
        code: `DEPT-S301-VAL-${randomUUID().slice(0, 6)}`,
      },
    });
    testDept3Id = testDept3.id;

    // Phòng ban riêng cho kiểm tra điều kiện isActive
    const testDeptActive = await prisma.department.create({
      data: {
        id: randomUUID(),
        name: `Phòng ban Test isActive ${randomUUID().slice(0, 6)}`,
        code: `DEPT-ACT-${randomUUID().slice(0, 6)}`,
      },
    });
    testDeptActiveId = testDeptActive.id;

    // 3. Tạo chức danh test
    const jobTitle = await prisma.jobTitle.create({
      data: {
        id: randomUUID(),
        code: `JT-S301-${randomUUID().slice(0, 6)}`,
        name: 'Chức danh test S3-01',
        level: 'Chuyên viên',
        minSalary: 5000000,
        maxSalary: 100000000,
      },
    });
    testJobTitleId = jobTitle.id;

    // 4. Tạo các tài khoản phê duyệt phục vụ kiểm thử
    const approverRole = await prisma.role.findUnique({
      where: { name: RoleType.APPROVER },
    });
    const hrRole = await prisma.role.findUnique({
      where: { name: RoleType.HR_MANAGER },
    });
    const defaultPassword = await hashPassword('Password123!');

    async function createTestApprover(email: string, fullName: string, isActive = true) {
      const user = await prisma.user.create({
        data: {
          id: randomUUID(),
          email,
          fullName,
          passwordHash: defaultPassword,
          departmentId: testDeptId,
          isActive,
          roles: {
            create: { roleId: approverRole!.id },
          },
        },
      });
      return user;
    }

    approver1 = await createTestApprover(`approver1_${Date.now()}@ats.local`, 'Người duyệt Cấp 1', true);
    approver2 = await createTestApprover(`approver2_${Date.now()}@ats.local`, 'Người duyệt Cấp 2', true);
    approver3 = await createTestApprover(`approver3_${Date.now()}@ats.local`, 'Người duyệt Cấp 3', true);
    inactiveApprover = await createTestApprover(`inactive_${Date.now()}@ats.local`, 'Người duyệt không hoạt động', false);

    // Người dùng đồng thời có vai trò APPROVER và HR_MANAGER và đang hoạt động
    dualRoleUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `dual_role_${Date.now()}@ats.local`,
        fullName: 'Người duyệt kiêm HR Manager',
        passwordHash: defaultPassword,
        departmentId: testDeptId,
        isActive: true,
        roles: {
          create: [
            { roleId: approverRole!.id },
            { roleId: hrRole!.id },
          ],
        },
      },
    });

    adminUser = await prisma.user.findUnique({ where: { email: 'admin@ats.local' } });
    hrUser = await prisma.user.findUnique({ where: { email: 'hr_manager@ats.local' } });
  });

  // PR67: ngan sach test cho cac phong ban cua workflow.
  beforeEach(async () => {
    for (const departmentId of [testDeptId, testDept3Id, testDeptActiveId]) {
      const exists = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      });
      if (!exists) continue;

      await prisma.departmentHeadcountBudget.upsert({
        where: { departmentId_year: { departmentId, year: 2099 } },
        create: { departmentId, year: 2099, headcount: 10000 },
        update: { headcount: 10000 },
      });
    }
  });

  afterAll(async () => {
    await prisma.departmentHeadcountBudget.deleteMany({
      where: { departmentId: { in: [testDeptId, testDept3Id, testDeptActiveId] }, year: 2099 },
    });
    // 1. Xóa tất cả requisition, workflow và department test trước
    const testDeptIds = [testDeptId, testDept3Id, testDeptActiveId].filter(Boolean);
    if (testDeptIds.length > 0) {
      await prisma.requisition.deleteMany({
        where: { departmentId: { in: testDeptIds } },
      });
      await prisma.approvalWorkflowRange.deleteMany({
        where: { workflow: { departmentId: { in: testDeptIds } } },
      });
      await prisma.approvalWorkflow.deleteMany({
        where: { departmentId: { in: testDeptIds } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: testDeptIds } },
      });
    }

    // 2. Xóa chức danh test
    if (testJobTitleId) {
      await prisma.jobTitle.deleteMany({ where: { id: testJobTitleId } });
    }

    // 3. Xóa người dùng test
    const allTestUserIds = [
      approver1?.id,
      approver2?.id,
      approver3?.id,
      inactiveApprover?.id,
      dualRoleUser?.id,
      ...extraUserIds,
    ].filter(Boolean);

    if (allTestUserIds.length > 0) {
      await prisma.userRole.deleteMany({
        where: { userId: { in: allTestUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: allTestUserIds } },
      });
    }
  });

  function makeRequisitionPayload(overrides: Record<string, any> = {}) {
    return {
      departmentId: testDeptId,
      jobTitleId: testJobTitleId,
      reason: 'NEW',
      headcount: 1,
      proposedSalaryMin: 10000000,
      proposedSalaryMax: 18000000,
      targetDate: '2099-12-31T00:00:00.000Z',
      description: 'Tuyển dụng kiểm thử S3-01',
      requirements: 'Yêu cầu kiểm thử',
      ...overrides,
    };
  }

  // =========================================================================
  // TIÊU CHÍ 1: Cho phép khai báo chuỗi cấp duyệt theo phòng ban và mức lương đề xuất
  // =========================================================================
  describe('Tiêu chí 1: Khai báo chuỗi cấp duyệt theo phòng ban và mức lương', () => {
    it('HR_MANAGER lưu thành công cấu hình luồng phê duyệt với nhiều dải lương', async () => {
      const payload = {
        departmentId: testDeptId,
        activation: 'NEW_REQUESTS_ONLY',
        ranges: [
          {
            minSalary: 0,
            maxSalary: 20000000,
            approverIds: [approver1.id], // 1 cấp
          },
          {
            minSalary: 20000001,
            maxSalary: 50000000,
            approverIds: [approver1.id, approver2.id], // 2 cấp
          },
          {
            minSalary: 50000001,
            maxSalary: null, // Không giới hạn
            approverIds: [approver1.id, approver2.id, approver3.id], // 3 cấp
          },
        ],
      };

      const res = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(hrToken))
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.departmentId).toBe(testDeptId);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.ranges).toHaveLength(3);
      expect(res.body.data.ranges[0].approverIds).toEqual([approver1.id]);
      expect(res.body.data.ranges[2].maxSalary).toBeNull();
    });

    it('GET /api/approval-workflows trả về danh sách cấu hình của các phòng ban', async () => {
      const res = await request(app)
        .get('/api/approval-workflows')
        .set(authHeader(hrToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((w: any) => w.departmentId === testDeptId);
      expect(found).toBeDefined();
      expect(found.version).toBe(1);
    });

    it('GET /api/approval-workflows/:departmentId trả về cấu hình chi tiết của phòng ban', async () => {
      const res = await request(app)
        .get(`/api/approval-workflows/${testDeptId}`)
        .set(authHeader(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.departmentId).toBe(testDeptId);
      expect(res.body.data.ranges).toHaveLength(3);
    });

    it('Từ chối người dùng không có quyền (RECRUITER, CANDIDATE) truy cập API cấu hình -> 403', async () => {
      const resRecruiter = await request(app)
        .get('/api/approval-workflows')
        .set(authHeader(recruiterToken));
      expect(resRecruiter.status).toBe(403);

      const resCandidate = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(candidateToken))
        .send({ departmentId: testDeptId, ranges: [] });
      expect(resCandidate.status).toBe(403);
    });
  });

  // =========================================================================
  // TIÊU CHÍ 2: Yêu cầu vượt hạn mức phải tự động bổ sung cấp duyệt cao hơn
  // =========================================================================
  describe('Tiêu chí 2: Tự động bổ sung cấp duyệt cao hơn khi vượt hạn mức', () => {
    it('Yêu cầu tuyển dụng trong dải 1 (<= 20tr) chỉ cần 1 cấp duyệt', async () => {
      const res = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrToken))
        .send(makeRequisitionPayload({ proposedSalaryMin: 10000000, proposedSalaryMax: 18000000, description: 'Tuyển dụng dải 1' }));

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING_APPROVAL');
      expect(res.body.data.approverId).toBe(approver1.id);

      const chain = JSON.parse(res.body.data.approvalChain);
      expect(chain).toHaveLength(1);
      expect(chain[0].step).toBe(1);
      expect(chain[0].approverId).toBe(approver1.id);
      expect(chain[0].status).toBe('PENDING');

      // Approver 1 duyệt -> Hoàn tất thành APPROVED
      const approver1Token = (await loginAndGetToken(approver1.email)).token;
      const approveRes = await request(app)
        .post(`/api/requisitions/${res.body.data.id}/approve`)
        .set(authHeader(approver1Token))
        .send({ decision: 'APPROVE', notes: 'Duyệt dải 1' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');
    });

    it('Yêu cầu vượt hạn mức dải 1 sang dải 2 (30tr) tự động bổ sung cấp duyệt 2 và đi tuần tự', async () => {
      const res = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrToken))
        .send(makeRequisitionPayload({ proposedSalaryMin: 22000000, proposedSalaryMax: 35000000, description: 'Tuyển dụng dải 2' }));

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING_APPROVAL');
      // Ban đầu cấp 1 duyệt trước
      expect(res.body.data.approverId).toBe(approver1.id);

      const chain = JSON.parse(res.body.data.approvalChain);
      expect(chain).toHaveLength(2); // Tự động bổ sung cấp 2
      expect(chain[0].approverId).toBe(approver1.id);
      expect(chain[0].status).toBe('PENDING');
      expect(chain[1].approverId).toBe(approver2.id);
      expect(chain[1].status).toBe('WAITING');

      const reqId = res.body.data.id;
      const approver1Token = (await loginAndGetToken(approver1.email)).token;
      const approver2Token = (await loginAndGetToken(approver2.email)).token;

      // Approver 2 cố duyệt trước khi cấp 1 duyệt -> Bị chặn 403 (chưa đến lượt)
      const earlyApproveRes = await request(app)
        .post(`/api/requisitions/${reqId}/approve`)
        .set(authHeader(approver2Token))
        .send({ decision: 'APPROVE' });
      expect(earlyApproveRes.status).toBe(403);

      // Approver 1 duyệt cấp 1 -> Trạng thái vẫn là PENDING_APPROVAL, chuyển sang approver2
      const step1Res = await request(app)
        .post(`/api/requisitions/${reqId}/approve`)
        .set(authHeader(approver1Token))
        .send({ decision: 'APPROVE', notes: 'Cấp 1 đồng ý' });

      expect(step1Res.status).toBe(200);
      expect(step1Res.body.data.status).toBe('PENDING_APPROVAL');
      expect(step1Res.body.data.approverId).toBe(approver2.id);

      const step1Chain = JSON.parse(step1Res.body.data.approvalChain);
      expect(step1Chain[0].status).toBe('APPROVED');
      expect(step1Chain[1].status).toBe('PENDING');

      // Approver 1 cố duyệt lại lần 2 sau khi đã chuyển quyền sang approver2 -> Bị chặn 403
      const duplicateApproveRes = await request(app)
        .post(`/api/requisitions/${reqId}/approve`)
        .set(authHeader(approver1Token))
        .send({ decision: 'APPROVE', notes: 'Cố duyệt lại lần 2' });
      expect(duplicateApproveRes.status).toBe(403);

      // Approver 2 duyệt cấp 2 (cấp cuối) -> Hoàn tất thành APPROVED
      const step2Res = await request(app)
        .post(`/api/requisitions/${reqId}/approve`)
        .set(authHeader(approver2Token))
        .send({ decision: 'APPROVE', notes: 'Cấp 2 đồng ý' });

      expect(step2Res.status).toBe(200);
      expect(step2Res.body.data.status).toBe('APPROVED');
      const step2Chain = JSON.parse(step2Res.body.data.approvalChain);
      expect(step2Chain[0].status).toBe('APPROVED');
      expect(step2Chain[1].status).toBe('APPROVED');
    });

    it('Từ chối (REJECT) ở cấp 1 làm dừng quy trình, chuyển trạng thái Requisition thành REJECTED', async () => {
      const res = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrToken))
        .send(makeRequisitionPayload({ proposedSalaryMin: 22000000, proposedSalaryMax: 35000000, description: 'Tuyển dụng test từ chối cấp 1' }));

      expect(res.status).toBe(201);
      const reqId = res.body.data.id;
      const approver1Token = (await loginAndGetToken(approver1.email)).token;

      const rejectRes = await request(app)
        .post(`/api/requisitions/${reqId}/approve`)
        .set(authHeader(approver1Token))
        .send({ decision: 'REJECT', notes: 'Không đồng ý ngân sách cấp 1' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('REJECTED');
      const chain = JSON.parse(rejectRes.body.data.approvalChain);
      expect(chain[0].status).toBe('REJECTED');
      expect(chain[0].notes).toBe('Không đồng ý ngân sách cấp 1');
      expect(chain[1].status).toBe('WAITING'); // Cấp 2 không được duyệt tiếp
    });

    it('Từ chối (REJECT) ở cấp 2 trong luồng nhiều cấp chuyển trạng thái Requisition thành REJECTED', async () => {
      const res = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrToken))
        .send(makeRequisitionPayload({ proposedSalaryMin: 22000000, proposedSalaryMax: 35000000, description: 'Tuyển dụng test từ chối cấp 2' }));

      expect(res.status).toBe(201);
      const reqId = res.body.data.id;
      const approver1Token = (await loginAndGetToken(approver1.email)).token;
      const approver2Token = (await loginAndGetToken(approver2.email)).token;

      // Cấp 1 duyệt trước
      await request(app)
        .post(`/api/requisitions/${reqId}/approve`)
        .set(authHeader(approver1Token))
        .send({ decision: 'APPROVE', notes: 'Cấp 1 duyệt' });

      // Cấp 2 từ chối
      const rejectRes = await request(app)
        .post(`/api/requisitions/${reqId}/approve`)
        .set(authHeader(approver2Token))
        .send({ decision: 'REJECT', notes: 'Cấp 2 từ chối' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('REJECTED');
      const chain = JSON.parse(rejectRes.body.data.approvalChain);
      expect(chain[0].status).toBe('APPROVED');
      expect(chain[1].status).toBe('REJECTED');
      expect(chain[1].notes).toBe('Cấp 2 từ chối');
    });

    it('Yêu cầu vượt hạn mức sang dải 3 (> 50tr) tự động bổ sung đủ 3 cấp duyệt', async () => {
      const res = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrToken))
        .send(makeRequisitionPayload({ proposedSalaryMin: 55000000, proposedSalaryMax: 70000000, description: 'Tuyển dụng dải 3' }));

      expect(res.status).toBe(201);
      const chain = JSON.parse(res.body.data.approvalChain);
      expect(chain).toHaveLength(3); // Tự động bổ sung 3 cấp duyệt
      expect(chain.map((s: any) => s.approverId)).toEqual([approver1.id, approver2.id, approver3.id]);
    });
  });

  // =========================================================================
  // TIÊU CHÍ 3: Từ chối lưu cấu hình không hợp lệ với lỗi rõ ràng
  // =========================================================================
  describe('Tiêu chí 3: Từ chối lưu cấu hình không hợp lệ', () => {
    it.each([
      {
        name: 'dải đầu tiên không bắt đầu từ 0 VNĐ',
        getRanges: () => [{ minSalary: 5000000, maxSalary: null, approverIds: [approver1.id] }],
        code: 'INVALID_SALARY_RANGE',
        expectedMsg: 'bắt đầu từ 0',
      },
      {
        name: 'các dải lương có khoảng trống (gap)',
        getRanges: () => [
          { minSalary: 0, maxSalary: 20000000, approverIds: [approver1.id] },
          { minSalary: 25000000, maxSalary: null, approverIds: [approver1.id, approver2.id] },
        ],
        code: 'GAP_IN_SALARY_RANGES',
      },
      {
        name: 'các dải lương chồng lấn nhau',
        getRanges: () => [
          { minSalary: 0, maxSalary: 30000000, approverIds: [approver1.id] },
          { minSalary: 25000000, maxSalary: null, approverIds: [approver1.id, approver2.id] },
        ],
        code: 'OVERLAPPING_SALARY_RANGE',
      },
      {
        name: 'dải cao hơn có ít cấp duyệt hơn dải thấp hơn',
        getRanges: () => [
          { minSalary: 0, maxSalary: 20000000, approverIds: [approver1.id, approver2.id] },
          { minSalary: 20000001, maxSalary: null, approverIds: [approver1.id] },
        ],
        code: 'INVALID_APPROVAL_STEPS',
        expectedMsg: 'ít cấp phê duyệt hơn',
      },
      {
        name: 'dải cao nhất bị giới hạn kết thúc (không để mở maxSalary = null)',
        getRanges: () => [
          { minSalary: 0, maxSalary: 50000000, approverIds: [approver1.id] },
        ],
        code: 'UNBOUNDED_TOP_RANGE_REQUIRED',
      },
      {
        name: 'chọn trùng người duyệt trong cùng 1 dải lương',
        getRanges: () => [
          { minSalary: 0, maxSalary: null, approverIds: [approver1.id, approver1.id] },
        ],
        code: 'DUPLICATE_APPROVER_IN_RANGE',
      },
    ])('Từ chối nếu $name', async ({ getRanges, code, expectedMsg }) => {
      const res = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(hrToken))
        .send({
          departmentId: testDept3Id,
          ranges: getRanges(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(code);
      if (expectedMsg) {
        expect(res.body.error.message).toContain(expectedMsg);
      }
    });

    it('Chấp nhận người duyệt có vai trò APPROVER và đang hoạt động (isActive === true)', async () => {
      const res = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(hrToken))
        .send({
          departmentId: testDept3Id,
          ranges: [
            { minSalary: 0, maxSalary: null, approverIds: [approver1.id] },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('Từ chối nếu người duyệt có vai trò APPROVER nhưng tài khoản không hoạt động (isActive === false) -> 400 INACTIVE_APPROVER', async () => {
      const res = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(hrToken))
        .send({
          departmentId: testDept3Id,
          ranges: [
            { minSalary: 0, maxSalary: null, approverIds: [inactiveApprover.id] },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INACTIVE_APPROVER');
      expect(res.body.error.message).toContain('đã bị vô hiệu hóa hoặc không hoạt động');
    });

    it.each([
      { roleName: 'ADMIN', getUserId: () => adminUser.id },
      { roleName: 'HR_MANAGER', getUserId: () => hrUser.id },
      { roleName: 'CANDIDATE', getUserId: async () => (await prisma.user.findUnique({ where: { email: 'candidate1@ats.local' } }))!.id },
    ])('Từ chối tài khoản có vai trò $roleName nhưng không có vai trò APPROVER -> 400 APPROVER_ROLE_REQUIRED', async ({ getUserId }) => {
      const userId = await getUserId();
      const res = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(hrToken))
        .send({
          departmentId: testDept3Id,
          ranges: [
            { minSalary: 0, maxSalary: null, approverIds: [userId] },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('APPROVER_ROLE_REQUIRED');
    });

    it('Chấp nhận tài khoản có vai trò APPROVER cùng với HR_MANAGER/ADMIN và đang hoạt động -> 201', async () => {
      const res = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(hrToken))
        .send({
          departmentId: testDept3Id,
          ranges: [
            { minSalary: 0, maxSalary: null, approverIds: [dualRoleUser.id] },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // TIÊU CHÍ 4: Khi cấu hình thay đổi, luồng duyệt đang chạy không bị ảnh hưởng
  // =========================================================================
  describe('Tiêu chí 4: Bảo toàn các luồng phê duyệt đang chạy khi cấu hình đổi phiên bản', () => {
    it('Yêu cầu đang chạy tiếp tục dùng snapshot cũ khi cấu hình phòng ban được lưu phiên bản mới', async () => {
      // 1. Tạo Requisition X khi cấu hình đang ở Version 1 (dải 2: 2 cấp approver1 -> approver2)
      const createRes = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrToken))
        .send(
          makeRequisitionPayload({
            proposedSalaryMin: 25000000,
            proposedSalaryMax: 30000000,
            description: 'Requisition chạy song song khi đổi config',
            requirements: 'Test snapshot',
          })
        );

      expect(createRes.status).toBe(201);
      const reqXId = createRes.body.data.id;
      expect(createRes.body.data.approvalWorkflowVersion).toBe(1);
      expect(createRes.body.data.approverId).toBe(approver1.id);

      // 2. HR_MANAGER lưu cấu hình mới (Version 2) cho cùng phòng ban đó
      // Ở version 2: dải 20tr - 50tr đổi người duyệt cấp 2 thành approver3 thay vì approver2
      const updateConfigRes = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(hrToken))
        .send({
          departmentId: testDeptId,
          activation: 'NEW_REQUESTS_ONLY',
          ranges: [
            { minSalary: 0, maxSalary: 20000000, approverIds: [approver1.id] },
            { minSalary: 20000001, maxSalary: 50000000, approverIds: [approver1.id, approver3.id] }, // Đổi thành approver3
            { minSalary: 50000001, maxSalary: null, approverIds: [approver1.id, approver2.id, approver3.id] },
          ],
        });

      expect(updateConfigRes.status).toBe(201);
      expect(updateConfigRes.body.data.version).toBe(2);

      // 3. Kiểm tra Requisition X đang chạy: Vẫn giữ nguyên Version 1 và snapshot chuỗi duyệt cũ
      const reqXGet = await request(app)
        .get(`/api/requisitions/${reqXId}`)
        .set(authHeader(hrToken));

      expect(reqXGet.status).toBe(200);
      expect(reqXGet.body.data.approvalWorkflowVersion).toBe(1);
      const chainX = JSON.parse(reqXGet.body.data.approvalChain);
      expect(chainX[1].approverId).toBe(approver2.id); // Vẫn là approver2 theo snapshot cũ!

      // 4. Cho approver1 duyệt cấp 1 của Requisition X
      const approver1Token = (await loginAndGetToken(approver1.email)).token;
      const step1Res = await request(app)
        .post(`/api/requisitions/${reqXId}/approve`)
        .set(authHeader(approver1Token))
        .send({ decision: 'APPROVE', notes: 'Duyệt theo snapshot cũ' });

      expect(step1Res.status).toBe(200);
      // Chuyển sang approver2 (theo snapshot cũ), KHÔNG chuyển sang approver3 của Version 2!
      expect(step1Res.body.data.approverId).toBe(approver2.id);

      // 5. Approver 2 duyệt hoàn tất Requisition X
      const approver2Token = (await loginAndGetToken(approver2.email)).token;
      const step2Res = await request(app)
        .post(`/api/requisitions/${reqXId}/approve`)
        .set(authHeader(approver2Token))
        .send({ decision: 'APPROVE', notes: 'Approver 2 hoàn tất' });

      expect(step2Res.status).toBe(200);
      expect(step2Res.body.data.status).toBe('APPROVED');

      // 6. Tạo Requisition Y MỚI sau khi Version 2 đã lưu
      // Requisition Y phải tự động nhận cấu hình Version 2 (approver1 -> approver3)
      const createYRes = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrToken))
        .send(
          makeRequisitionPayload({
            proposedSalaryMin: 25000000,
            proposedSalaryMax: 30000000,
            description: 'Requisition Y tạo sau khi có Version 2',
            requirements: 'Test version 2',
          })
        );

      expect(createYRes.status).toBe(201);
      expect(createYRes.body.data.approvalWorkflowVersion).toBe(2);
      const chainY = JSON.parse(createYRes.body.data.approvalChain);
      expect(chainY[1].approverId).toBe(approver3.id); // Đúng là approver3 của Version 2!
    });
  });

  // =========================================================================
  // KIỂM TRA TOÀN DIỆN ĐIỀU KIỆN isActive CỦA NGƯỜI PHÊ DUYỆT (SCRUM-87)
  // =========================================================================
  describe('Kiểm tra toàn diện điều kiện isActive của người phê duyệt', () => {
    it('Người phê duyệt bị vô hiệu hóa (isActive = false) bị chặn khi cố duyệt -> 401 ACCOUNT_INACTIVE', async () => {
      const defaultPassword = await hashPassword('Password123!');
      const approverRole = await prisma.role.findUnique({ where: { name: RoleType.APPROVER } });
      const testUser = await prisma.user.create({
        data: {
          id: randomUUID(),
          email: `test_inactive_exec_${Date.now()}@ats.local`,
          fullName: 'Người duyệt thử nghiệm bị khóa',
          passwordHash: defaultPassword,
          departmentId: testDeptActiveId,
          isActive: true,
          roles: { create: { roleId: approverRole!.id } },
        },
      });
      extraUserIds.push(testUser.id);

      const loginRes = await loginAndGetToken(testUser.email);
      const userToken = loginRes.token;

      // Vô hiệu hóa tài khoản
      await prisma.user.update({
        where: { id: testUser.id },
        data: { isActive: false },
      });

      // Cố gọi API duyệt -> Bị chặn 401 ACCOUNT_INACTIVE
      const approveRes = await request(app)
        .post('/api/requisitions/00000000-0000-0000-0000-000000000000/approve')
        .set(authHeader(userToken))
        .send({ decision: 'APPROVE' });

      expect(approveRes.status).toBe(401);
      expect(approveRes.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('Không có người phê duyệt đang hoạt động phù hợp: từ chối tạo yêu cầu tuyển dụng với mã lỗi 400 NO_ACTIVE_APPROVER', async () => {
      // 1. Tạo approver đang active
      const defaultPassword = await hashPassword('Password123!');
      const approverRole = await prisma.role.findUnique({ where: { name: RoleType.APPROVER } });
      const dynamicApprover = await prisma.user.create({
        data: {
          id: randomUUID(),
          email: `dyn_approver_${Date.now()}@ats.local`,
          fullName: 'Người duyệt sắp bị vô hiệu hóa',
          passwordHash: defaultPassword,
          departmentId: testDeptActiveId,
          isActive: true,
          roles: { create: { roleId: approverRole!.id } },
        },
      });
      extraUserIds.push(dynamicApprover.id);

      // 2. Lưu cấu hình thành công với dynamicApprover khi tài khoản còn active
      const configRes = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(hrToken))
        .send({
          departmentId: testDeptActiveId,
          ranges: [
            { minSalary: 0, maxSalary: null, approverIds: [dynamicApprover.id] },
          ],
        });
      expect(configRes.status).toBe(201);

      // 3. Sau đó, dynamicApprover bị vô hiệu hóa (isActive = false)
      await prisma.user.update({
        where: { id: dynamicApprover.id },
        data: { isActive: false },
      });

      // 4. Khi nộp Requisition mới: Trả về lỗi 400 NO_ACTIVE_APPROVER
      const createRes = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrToken))
        .send(
          makeRequisitionPayload({
            departmentId: testDeptActiveId,
            proposedSalaryMin: 15000000,
            proposedSalaryMax: 25000000,
            description: 'Tuyển dụng kiểm tra không có người duyệt hoạt động',
            requirements: 'Test no active approver',
          })
        );

      expect(createRes.status).toBe(400);
      expect(createRes.body.error.code).toBe('NO_ACTIVE_APPROVER');
      expect(createRes.body.error.message).toContain('Không có người phê duyệt đang hoạt động phù hợp');
    });

    it('Luồng phê duyệt đã khởi chạy trước khi người phê duyệt bị vô hiệu hóa: bảo toàn snapshot cũ, người duyệt bị khóa không thể duyệt, Admin can thiệp duyệt thay thế thành công', async () => {
      // 1. Tạo approver đang active
      const defaultPassword = await hashPassword('Password123!');
      const approverRole = await prisma.role.findUnique({ where: { name: RoleType.APPROVER } });
      const tempApprover = await prisma.user.create({
        data: {
          id: randomUUID(),
          email: `temp_approver_${Date.now()}@ats.local`,
          fullName: 'Người duyệt chạy luồng trước khi khóa',
          passwordHash: defaultPassword,
          departmentId: testDeptActiveId,
          isActive: true,
          roles: { create: { roleId: approverRole!.id } },
        },
      });
      extraUserIds.push(tempApprover.id);

      // 2. Lưu cấu hình với tempApprover
      const configRes = await request(app)
        .post('/api/approval-workflows')
        .set(authHeader(hrToken))
        .send({
          departmentId: testDeptActiveId,
          ranges: [
            { minSalary: 0, maxSalary: null, approverIds: [tempApprover.id] },
          ],
        });
      expect(configRes.status).toBe(201);

      // Lấy token của tempApprover trước khi khóa
      const tempLogin = await loginAndGetToken(tempApprover.email);
      const tempToken = tempLogin.token;

      // 3. Khởi chạy luồng: Nộp Requisition khi tempApprover vẫn đang active
      const createRes = await request(app)
        .post('/api/requisitions')
        .set(authHeader(hrToken))
        .send(
          makeRequisitionPayload({
            departmentId: testDeptActiveId,
            proposedSalaryMin: 10000000,
            proposedSalaryMax: 20000000,
            description: 'Tuyển dụng kiểm tra luồng đã chạy trước khi approver đổi trạng thái',
            requirements: 'Test snapshot vs inactive approver',
          })
        );

      expect(createRes.status).toBe(201);
      const reqId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('PENDING_APPROVAL');
      expect(createRes.body.data.approverId).toBe(tempApprover.id);
      expect(createRes.body.data.approvalChain).toBeDefined();

      // 4. BÂY GIỜ tempApprover bị vô hiệu hóa (isActive = false)
      await prisma.user.update({
        where: { id: tempApprover.id },
        data: { isActive: false },
      });

      // 5. Kiểm tra: Requisition đang chạy vẫn bảo toàn snapshot cũ
      const reqCheck = await prisma.requisition.findUnique({ where: { id: reqId } });
      expect(reqCheck!.status).toBe('PENDING_APPROVAL');
      expect(reqCheck!.approverId).toBe(tempApprover.id);
      const chain = JSON.parse(reqCheck!.approvalChain!);
      expect(chain[0].approverId).toBe(tempApprover.id);

      // 6. tempApprover cố gọi duyệt -> Bị chặn 401 ACCOUNT_INACTIVE
      const blockedApproveRes = await request(app)
        .post(`/api/requisitions/${reqId}/approve`)
        .set(authHeader(tempToken))
        .send({ decision: 'APPROVE', notes: 'Cố duyệt khi bị khóa' });

      expect(blockedApproveRes.status).toBe(401);
      expect(blockedApproveRes.body.error.code).toBe('ACCOUNT_INACTIVE');

      // 7. Admin can thiệp duyệt thay thế để luồng không bị kẹt vĩnh viễn
      const adminApproveRes = await request(app)
        .post(`/api/requisitions/${reqId}/approve`)
        .set(authHeader(adminToken))
        .send({ decision: 'APPROVE', notes: 'Admin phê duyệt thay thế người duyệt bị vô hiệu hóa' });

      expect(adminApproveRes.status).toBe(200);
      expect(adminApproveRes.body.data.status).toBe('APPROVED');
      const updatedChain = JSON.parse(adminApproveRes.body.data.approvalChain);
      expect(updatedChain[0].status).toBe('APPROVED');
      expect(updatedChain[0].notes).toContain('Admin phê duyệt thay thế');
    });
  });
});
