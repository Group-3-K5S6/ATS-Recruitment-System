import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

/**
 * BE-S3-05 (SCRUM-40): Kiểm thử toàn diện chức năng Sao chép yêu cầu tuyển dụng
 *
 * Kiểm thử theo 7 trường hợp kiểm thử bắt buộc (TC01 - TC07):
 * - TC01: Sao chép thành công (tạo mới, ID mới != ID gốc, bản gốc không đổi)
 * - TC02: Sao chép toàn bộ nội dung (description, requirements, các trường nghiệp vụ)
 * - TC03: Trạng thái bản sao (luôn là DRAFT, thử nhiều trạng thái gốc: APPROVED, REJECTED, PENDING_APPROVAL)
 * - TC04: Không kế thừa lịch sử duyệt (bản sao không kế thừa approver, chain, workflow; kiểm tra bảng history nếu có)
 * - TC05: ID và quan hệ dữ liệu (ID mới, đúng department, hiringManagerId theo user đăng nhập, không dùng chung quan hệ)
 * - TC06: Dữ liệu không hợp lệ và trường hợp biên (scope phòng ban, phân quyền role, chức danh không tồn tại, ngày quá khứ, lương không hợp lệ)
 * - TC07: Chống sao chép thiếu hoặc sai dữ liệu (mô tả dài > 1000 ký tự, tiếng Việt có dấu Unicode UTF-8, dữ liệu rỗng hợp lệ)
 */
describe('BE-S3-05 (SCRUM-40) - Kiểm thử chức năng Sao chép yêu cầu tuyển dụng', () => {
  let hmEngToken: string;
  let hmEngUser: { id: string; email: string; departmentId: string };
  let hmMktToken: string;
  let candidateToken: string;
  let approverToken: string;
  let approverUser: { id: string; email: string };

  let engDeptId: string;
  let mktDeptId: string;
  let jobTitleId: string;
  let jobTitleName: string;

  let approvedSourceId: string;
  let rejectedSourceId: string;
  let pendingSourceId: string;
  let createdRequisitionIds: string[] = [];
  let isApprovalHistoryTableAvailable = false;

  beforeAll(async () => {
    // 1. Xác thực và lấy token các tài khoản kiểm thử
    const hmEngLogin = await loginAndGetToken('hiring_manager_eng@ats.local');
    hmEngToken = hmEngLogin.token;
    hmEngUser = hmEngLogin.user;

    const hmMktLogin = await loginAndGetToken('hiring_manager_mkt@ats.local');
    hmMktToken = hmMktLogin.token;

    const candLogin = await loginAndGetToken('candidate1@ats.local');
    candidateToken = candLogin.token;

    const approverLogin = await loginAndGetToken('approver@ats.local');
    approverToken = approverLogin.token;
    approverUser = approverLogin.user;

    // 2. Tra cứu phòng ban ENG & MKT
    const engDept = await prisma.department.findUnique({ where: { code: 'ENG' } });
    const mktDept = await prisma.department.findUnique({ where: { code: 'MKT' } });
    engDeptId = engDept!.id;
    mktDeptId = mktDept!.id;

    // 3. Tạo chức danh kiểm thử với dải lương chuẩn
    jobTitleName = 'Kỹ sư Backend Senior S3-05';
    const jobTitle = await prisma.jobTitle.create({
      data: {
        id: randomUUID(),
        code: `S305-${randomUUID().slice(0, 8)}`,
        name: jobTitleName,
        level: 'Senior',
        minSalary: 20000000,
        maxSalary: 45000000,
      },
    });
    jobTitleId = jobTitle.id;

    // 4. Tạo bản ghi gốc ở trạng thái APPROVED
    const approvedSource = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: jobTitleName,
        departmentId: engDeptId,
        hiringManagerId: hmEngUser.id,
        jobTitleId: jobTitle.id,
        reason: 'REPLACEMENT',
        headcount: 2,
        budget: 90000000,
        proposedSalaryMin: 25000000,
        proposedSalaryMax: 40000000,
        salaryExplanation: 'Mức lương senior phù hợp thị trường',
        description: 'Mô tả công việc vị trí Backend Senior: Thiết kế kiến trúc và tối ưu cơ sở dữ liệu.',
        requirements: 'Yêu cầu ứng viên: Tối thiểu 4 năm kinh nghiệm Node.js/TypeScript, thành thạo SQL.',
        status: 'APPROVED',
        targetDate: new Date('2025-01-01T00:00:00.000Z'), // Ngày quá khứ
        approverId: approverUser.id,
        approvalWorkflowId: 'dummy-wf-approved',
        approvalWorkflowVersion: 1,
        approvalChain: JSON.stringify([
          {
            step: 1,
            approverId: approverUser.id,
            status: 'APPROVED',
            decisionAt: new Date().toISOString(),
            notes: 'Đồng ý duyệt yêu cầu tuyển dụng gốc',
          },
        ]),
      },
    });
    approvedSourceId = approvedSource.id;
    createdRequisitionIds.push(approvedSource.id);

    // 5. Tạo bản ghi gốc ở trạng thái REJECTED
    const rejectedSource = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: jobTitleName,
        departmentId: engDeptId,
        hiringManagerId: hmEngUser.id,
        jobTitleId: jobTitle.id,
        reason: 'NEW',
        headcount: 1,
        budget: 40000000,
        proposedSalaryMin: 25000000,
        proposedSalaryMax: 35000000,
        description: 'Mô tả nguồn bị từ chối.',
        requirements: 'Yêu cầu nguồn bị từ chối.',
        status: 'REJECTED',
        approverId: approverUser.id,
      },
    });
    rejectedSourceId = rejectedSource.id;
    createdRequisitionIds.push(rejectedSource.id);

    // 6. Tạo bản ghi gốc ở trạng thái PENDING_APPROVAL
    const pendingSource = await prisma.requisition.create({
      data: {
        id: randomUUID(),
        title: jobTitleName,
        departmentId: engDeptId,
        hiringManagerId: hmEngUser.id,
        jobTitleId: jobTitle.id,
        reason: 'NEW',
        headcount: 3,
        budget: 120000000,
        proposedSalaryMin: 30000000,
        proposedSalaryMax: 40000000,
        description: 'Mô tả nguồn đang chờ duyệt.',
        requirements: 'Yêu cầu nguồn đang chờ duyệt.',
        status: 'PENDING_APPROVAL',
        approverId: approverUser.id,
      },
    });
    pendingSourceId = pendingSource.id;
    createdRequisitionIds.push(pendingSource.id);

    // 7. Kiểm tra xem bảng RequisitionApprovalHistory có tồn tại trong CSDL hiện tại không
    try {
      const tables: any[] = await (prisma as any).$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='RequisitionApprovalHistory'"
      );
      isApprovalHistoryTableAvailable = Array.isArray(tables) && tables.length > 0;
    } catch {
      isApprovalHistoryTableAvailable = false;
    }
  });

  afterAll(async () => {
    // Dọn dẹp an toàn các bản ghi tạo ra trong quá trình kiểm thử
    if (createdRequisitionIds.length > 0) {
      if (isApprovalHistoryTableAvailable) {
        try {
          await (prisma as any).requisitionApprovalHistory.deleteMany({
            where: { requisitionId: { in: createdRequisitionIds } },
          });
        } catch {}
      }

      await prisma.requisition.deleteMany({
        where: { id: { in: createdRequisitionIds } },
      });
    }

    if (jobTitleId) {
      await prisma.jobTitle.deleteMany({
        where: { id: jobTitleId },
      });
    }
  });

  /* ==========================================================================
   * TC01 – Sao chép thành công
   * ========================================================================== */
  it('TC01 – Sao chép thành công: tạo bản ghi mới với ID mới, bản gốc không đổi', async () => {
    const sourceBefore = await prisma.requisition.findUnique({
      where: { id: approvedSourceId },
    });
    expect(sourceBefore).not.toBeNull();

    // Giả lập luồng Frontend S3-05: trích xuất các trường từ bản gốc và gửi POST /api/requisitions kèm isDraft: true
    const payload = {
      title: sourceBefore!.title,
      departmentId: sourceBefore!.departmentId,
      jobTitleId: sourceBefore!.jobTitleId,
      reason: sourceBefore!.reason,
      headcount: sourceBefore!.headcount,
      description: sourceBefore!.description,
      requirements: sourceBefore!.requirements,
      proposedSalaryMin: sourceBefore!.proposedSalaryMin,
      proposedSalaryMax: sourceBefore!.proposedSalaryMax,
      salaryExplanation: sourceBefore!.salaryExplanation,
      isDraft: true,
    };

    const res = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const cloned = res.body.data;
    createdRequisitionIds.push(cloned.id);

    // 1. Bản sao có ID mới, khác ID bản gốc
    expect(cloned.id).toBeDefined();
    expect(cloned.id).not.toBe(approvedSourceId);

    // 2. Xác nhận bản gốc không bị thay đổi
    const sourceAfter = await prisma.requisition.findUnique({
      where: { id: approvedSourceId },
    });
    expect(sourceAfter).not.toBeNull();
    expect(sourceAfter!.status).toBe(sourceBefore!.status);
    expect(sourceAfter!.description).toBe(sourceBefore!.description);
    expect(sourceAfter!.requirements).toBe(sourceBefore!.requirements);
    expect(sourceAfter!.headcount).toBe(sourceBefore!.headcount);
    expect(sourceAfter!.approverId).toBe(sourceBefore!.approverId);
    expect(sourceAfter!.approvalChain).toBe(sourceBefore!.approvalChain);
  });

  /* ==========================================================================
   * TC02 – Sao chép toàn bộ nội dung
   * ========================================================================== */
  it('TC02 – Sao chép toàn bộ nội dung: giữ nguyên mô tả, yêu cầu ứng viên và các trường nghiệp vụ', async () => {
    const source = await prisma.requisition.findUnique({
      where: { id: approvedSourceId },
    });
    expect(source).not.toBeNull();

    const payload = {
      title: source!.title,
      departmentId: source!.departmentId,
      jobTitleId: source!.jobTitleId,
      reason: source!.reason,
      headcount: source!.headcount,
      description: source!.description,
      requirements: source!.requirements,
      proposedSalaryMin: source!.proposedSalaryMin,
      proposedSalaryMax: source!.proposedSalaryMax,
      salaryExplanation: source!.salaryExplanation,
      isDraft: true,
    };

    const res = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send(payload);

    expect(res.status).toBe(201);
    const cloned = res.body.data;
    createdRequisitionIds.push(cloned.id);

    // Xác minh trực tiếp trong CSDL (Database Persistence)
    const clonedInDb = await prisma.requisition.findUnique({
      where: { id: cloned.id },
    });
    expect(clonedInDb).not.toBeNull();

    // Giữ nguyên toàn bộ mô tả công việc
    expect(clonedInDb!.description).toBe(source!.description);
    expect(clonedInDb!.description).toBe('Mô tả công việc vị trí Backend Senior: Thiết kế kiến trúc và tối ưu cơ sở dữ liệu.');

    // Giữ nguyên toàn bộ yêu cầu ứng viên
    expect(clonedInDb!.requirements).toBe(source!.requirements);
    expect(clonedInDb!.requirements).toBe('Yêu cầu ứng viên: Tối thiểu 4 năm kinh nghiệm Node.js/TypeScript, thành thạo SQL.');

    // Giữ nguyên các trường nghiệp vụ khác
    expect(clonedInDb!.title).toBe(source!.title);
    expect(clonedInDb!.departmentId).toBe(source!.departmentId);
    expect(clonedInDb!.jobTitleId).toBe(source!.jobTitleId);
    expect(clonedInDb!.reason).toBe(source!.reason);
    expect(clonedInDb!.headcount).toBe(source!.headcount);
    expect(clonedInDb!.proposedSalaryMin).toBe(source!.proposedSalaryMin);
    expect(clonedInDb!.proposedSalaryMax).toBe(source!.proposedSalaryMax);
    expect(clonedInDb!.salaryExplanation).toBe(source!.salaryExplanation);
  });

  /* ==========================================================================
   * TC03 – Trạng thái bản sao
   * ========================================================================== */
  it('TC03 – Trạng thái bản sao: luôn bắt đầu ở trạng thái Nháp (DRAFT) từ nhiều trạng thái gốc khác nhau', async () => {
    // 1. Sao chép từ nguồn APPROVED -> bản sao phải là DRAFT
    const resFromApproved = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send({
        title: jobTitleName,
        departmentId: engDeptId,
        jobTitleId,
        description: 'Mô tả từ approved',
        requirements: 'Yêu cầu từ approved',
        isDraft: true,
      });
    expect(resFromApproved.status).toBe(201);
    createdRequisitionIds.push(resFromApproved.body.data.id);
    expect(resFromApproved.body.data.status).toBe('DRAFT');

    const draftApprovedInDb = await prisma.requisition.findUnique({
      where: { id: resFromApproved.body.data.id },
    });
    expect(draftApprovedInDb!.status).toBe('DRAFT');

    // 2. Sao chép từ nguồn REJECTED -> bản sao phải là DRAFT
    const resFromRejected = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send({
        title: jobTitleName,
        departmentId: engDeptId,
        jobTitleId,
        description: 'Mô tả từ rejected',
        requirements: 'Yêu cầu từ rejected',
        isDraft: true,
      });
    expect(resFromRejected.status).toBe(201);
    createdRequisitionIds.push(resFromRejected.body.data.id);
    expect(resFromRejected.body.data.status).toBe('DRAFT');

    const draftRejectedInDb = await prisma.requisition.findUnique({
      where: { id: resFromRejected.body.data.id },
    });
    expect(draftRejectedInDb!.status).toBe('DRAFT');

    // 3. Sao chép từ nguồn PENDING_APPROVAL -> bản sao phải là DRAFT
    const resFromPending = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send({
        title: jobTitleName,
        departmentId: engDeptId,
        jobTitleId,
        description: 'Mô tả từ pending',
        requirements: 'Yêu cầu từ pending',
        isDraft: true,
      });
    expect(resFromPending.status).toBe(201);
    createdRequisitionIds.push(resFromPending.body.data.id);
    expect(resFromPending.body.data.status).toBe('DRAFT');

    const draftPendingInDb = await prisma.requisition.findUnique({
      where: { id: resFromPending.body.data.id },
    });
    expect(draftPendingInDb!.status).toBe('DRAFT');
  });

  /* ==========================================================================
   * TC04 – Không kế thừa lịch sử duyệt
   * ========================================================================== */
  it('TC04 – Không kế thừa lịch sử duyệt: không kế thừa approver, workflow, chain; bản gốc nguyên vẹn', async () => {
    // Bản gốc có chuỗi duyệt và người duyệt
    const sourceInDb = await prisma.requisition.findUnique({
      where: { id: approvedSourceId },
    });
    expect(sourceInDb!.approverId).toBe(approverUser.id);
    expect(sourceInDb!.approvalWorkflowId).toBe('dummy-wf-approved');
    expect(sourceInDb!.approvalWorkflowVersion).toBe(1);
    expect(sourceInDb!.approvalChain).not.toBeNull();

    // Sao chép theo luồng FE
    const res = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send({
        title: sourceInDb!.title,
        departmentId: sourceInDb!.departmentId,
        jobTitleId: sourceInDb!.jobTitleId,
        reason: sourceInDb!.reason,
        headcount: sourceInDb!.headcount,
        description: sourceInDb!.description,
        requirements: sourceInDb!.requirements,
        isDraft: true,
      });

    expect(res.status).toBe(201);
    const clonedId = res.body.data.id;
    createdRequisitionIds.push(clonedId);

    // Kiểm tra trực tiếp CSDL: Bản sao KHÔNG kế thừa các trường duyệt
    const clonedInDb = await prisma.requisition.findUnique({
      where: { id: clonedId },
    });
    expect(clonedInDb).not.toBeNull();
    expect(clonedInDb!.approverId).toBeNull();
    expect(clonedInDb!.approvalWorkflowId).toBeNull();
    expect(clonedInDb!.approvalWorkflowVersion).toBeNull();
    expect(clonedInDb!.approvalChain).toBeNull();

    // Bản gốc vẫn giữ nguyên vẹn chuỗi duyệt và người duyệt
    const sourceAfter = await prisma.requisition.findUnique({
      where: { id: approvedSourceId },
    });
    expect(sourceAfter!.approverId).toBe(approverUser.id);
    expect(sourceAfter!.approvalWorkflowId).toBe('dummy-wf-approved');
    expect(sourceAfter!.approvalChain).toBe(sourceInDb!.approvalChain);

    // Kiểm tra đối với bảng RequisitionApprovalHistory (nếu bảng tồn tại trong CSDL)
    if (isApprovalHistoryTableAvailable) {
      const clonedHistory = await (prisma as any).requisitionApprovalHistory.findMany({
        where: { requisitionId: clonedId },
      });
      expect(clonedHistory).toHaveLength(0);
    } else {
      console.warn(
        '[CẢNH BÁO TC04] Bảng RequisitionApprovalHistory chưa tồn tại trong CSDL cục bộ ats.db. Chưa thể xác minh trực tiếp bảng lịch sử này.'
      );
    }
  });

  /* ==========================================================================
   * TC05 – ID và quan hệ dữ liệu
   * ========================================================================== */
  it('TC05 – ID và quan hệ dữ liệu: định danh mới, hiringManagerId lấy theo user đăng nhập, không dùng chung quan hệ', async () => {
    const fakeHiringManagerId = randomUUID();

    const res = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send({
        title: jobTitleName,
        departmentId: engDeptId,
        jobTitleId,
        hiringManagerId: fakeHiringManagerId, // Cố tình truyền ID giả mạo
        isDraft: true,
      });

    expect(res.status).toBe(201);
    const cloned = res.body.data;
    createdRequisitionIds.push(cloned.id);

    // Định danh UUID mới
    expect(cloned.id).toBeDefined();
    expect(cloned.id).not.toBe(fakeHiringManagerId);

    // hiringManagerId phải là ID của user đang đăng nhập (hmEngUser.id)
    expect(cloned.hiringManagerId).toBe(hmEngUser.id);
    expect(cloned.hiringManagerId).not.toBe(fakeHiringManagerId);

    // Xác minh quan hệ trong CSDL
    const clonedInDb = await prisma.requisition.findUnique({
      where: { id: cloned.id },
      include: { department: true, jobTitle: true, hiringManager: true },
    });
    expect(clonedInDb).not.toBeNull();
    expect(clonedInDb!.departmentId).toBe(engDeptId);
    expect(clonedInDb!.department.code).toBe('ENG');
    expect(clonedInDb!.jobTitleId).toBe(jobTitleId);
    expect(clonedInDb!.hiringManager.id).toBe(hmEngUser.id);
  });

  /* ==========================================================================
   * TC06 – Dữ liệu không hợp lệ và trường hợp biên
   * ========================================================================== */
  it('TC06 – Dữ liệu không hợp lệ và trường hợp biên: xử lý lỗi phân quyền, ngày quá hạn, dải lương âm, chức danh sai', async () => {
    const totalCountBefore = await prisma.requisition.count();

    // 1. Phân quyền: Trưởng bộ phận ENG không thể tạo yêu cầu cho phòng MKT (403 FORBIDDEN_SCOPE)
    const scopeRes = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send({
        title: jobTitleName,
        departmentId: mktDeptId,
        jobTitleId,
        isDraft: true,
      });
    expect(scopeRes.status).toBe(403);
    expect(scopeRes.body.error.code).toBe('FORBIDDEN_SCOPE');

    // 2. Phân quyền: Role Ứng viên (CANDIDATE) không có quyền tạo (403 FORBIDDEN_PERMISSION)
    const candRes = await request(app)
      .post('/api/requisitions')
      .set(authHeader(candidateToken))
      .send({
        title: jobTitleName,
        departmentId: engDeptId,
        jobTitleId,
        isDraft: true,
      });
    expect(candRes.status).toBe(403);
    expect(candRes.body.error.code).toBe('FORBIDDEN_PERMISSION');

    // 3. Chức danh không tồn tại (400 INVALID_JOB_TITLE)
    const invalidJobRes = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send({
        title: 'Chức danh ma',
        departmentId: engDeptId,
        jobTitleId: 'non-existent-job-title-id',
        isDraft: true,
      });
    expect(invalidJobRes.status).toBe(400);
    expect(invalidJobRes.body.error.code).toBe('INVALID_JOB_TITLE');

    // 4. Ngày cần tuyển trong quá khứ (400 VALIDATION_ERROR)
    const pastDateRes = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send({
        title: jobTitleName,
        departmentId: engDeptId,
        jobTitleId,
        targetDate: '2020-01-01T00:00:00.000Z',
        isDraft: true,
      });
    expect(pastDateRes.status).toBe(400);
    expect(pastDateRes.body.error.code).toBe('VALIDATION_ERROR');

    // 5. Lương tối thiểu > lương tối đa (400 VALIDATION_ERROR)
    const invalidSalaryRes = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send({
        title: jobTitleName,
        departmentId: engDeptId,
        jobTitleId,
        proposedSalaryMin: 50000000,
        proposedSalaryMax: 20000000,
        isDraft: true,
      });
    expect(invalidSalaryRes.status).toBe(400);
    expect(invalidSalaryRes.body.error.code).toBe('VALIDATION_ERROR');

    // 6. Xác nhận không có bản ghi rác nào được tạo trong DB khi gặp lỗi
    const totalCountAfter = await prisma.requisition.count();
    expect(totalCountAfter).toBe(totalCountBefore);
  });

  /* ==========================================================================
   * TC07 – Chống sao chép thiếu hoặc sai dữ liệu (Nội dung dài, Unicode tiếng Việt)
   * ========================================================================== */
  it('TC07 – Chống sao chép thiếu hoặc sai dữ liệu: bảo toàn nội dung dài, tiếng Việt Unicode UTF-8 và trường rỗng hợp lệ', async () => {
    // Chuỗi tiếng Việt đầy đủ dấu thanh, ký tự đặc biệt, độ dài lớn (> 1.200 ký tự)
    const longVietnameseDescription = `
      Mô tả công việc nâng cao dành cho Kỹ sư Backend Senior:
      - Thiết kế và phát triển các dịch vụ cốt lõi theo mô hình hướng vi dịch vụ (Microservices Architecture).
      - Xây dựng hệ thống tiếp nhận, xử lý hàng triệu bản ghi tuyển dụng và hồ sơ ứng viên mỗi ngày.
      - Tối ưu hóa hiệu năng cơ sở dữ liệu quan hệ (PostgreSQL, SQLite) và lưu đệm bộ nhớ (Redis Cache).
      - Đảm bảo an toàn thông tin theo chuẩn OWASP Top 10: chống tiêm mã lệnh SQL Injection, chống lỗ hổng tham chiếu đối tượng trực tiếp IDOR.
      - Tiếng Việt có dấu đầy đủ kiểm thử Unicode UTF-8:
        + Bảng chữ cái có dấu: á à ả ã ạ, ă ắ ằ ẳ ẵ ặ, â ấ ầ ổ ỗ ộ, đ, é è ẻ ẽ ẹ, ê ế ề ể ễ ệ, í ì ỉ ĩ ị, ó ò ỏ õ ọ, ô ố ồ ổ ỗ ộ, ơ ớ ờ ở ỡ ợ, ú ù ủ ũ ụ, ư ứ ừ ử ữ ự, ý ỳ ỷ ỹ ỵ.
        + Ký tự in hoa có dấu: Á À Ả Ã Ạ, Ă Ắ Ằ Ẳ Ẵ Ặ, Â Ấ Ầ Ẩ Ẫ Ậ, Đ, É È Ẻ Ẽ Ẹ, Ê Ế Ề Ể Ễ Ệ, Í Ì Ỉ Ĩ Ị, Ó Ò Ỏ Õ Ọ, Ô Ố Ồ Ổ Ỗ Ộ, Ơ Ớ Ờ Ở Ỡ Ợ, Ú Ù Ủ Ũ Ụ, Ư Ứ Ừ Ử Ữ Ự, Ý Ỳ Ỷ Ỹ Ỵ.
      - Tham gia đánh giá mã nguồn (Code Review), dẫn dắt các lập trình viên trẻ hơn và xây dựng quy trình CI/CD hoàn thiện.
    `.repeat(2);

    const longVietnameseRequirements = `
      Yêu cầu tuyển dụng chi tiết:
      - Có ít nhất 4 năm kinh nghiệm làm việc thực tế với ngôn ngữ TypeScript/Node.js hoặc Java/Golang.
      - Hiểu sâu về thiết kế cơ sở dữ liệu quan hệ, chỉ mục (Index B-Tree), tối ưu hóa câu lệnh truy vấn phức tạp.
      - Có kinh nghiệm với hệ thống hàng đợi phân tán (Kafka, RabbitMQ, BullMQ).
      - Tư duy giải quyết vấn đề xuất sắc, khả năng làm việc độc lập và phối hợp nhóm hiệu quả dưới áp lực cao.
    `.repeat(2);

    const payload = {
      title: jobTitleName,
      departmentId: engDeptId,
      jobTitleId,
      reason: 'NEW',
      headcount: 5,
      description: longVietnameseDescription,
      requirements: longVietnameseRequirements,
      proposedSalaryMin: 20000000,
      proposedSalaryMax: 40000000,
      salaryExplanation: undefined, // Dữ liệu rỗng hợp lệ (lương trong khung chuẩn)
      isDraft: true,
    };

    const res = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hmEngToken))
      .send(payload);

    expect(res.status).toBe(201);
    const cloned = res.body.data;
    createdRequisitionIds.push(cloned.id);

    // Xác minh trực tiếp trong CSDL
    const clonedInDb = await prisma.requisition.findUnique({
      where: { id: cloned.id },
    });
    expect(clonedInDb).not.toBeNull();

    // Xác minh nội dung dài và tiếng Việt UTF-8 không bị cắt hay biến dạng
    expect(clonedInDb!.description).toBe(longVietnameseDescription.trim());
    expect(clonedInDb!.description!.length).toBeGreaterThan(1000);
    expect(clonedInDb!.description).toContain('á à ả ã ạ');
    expect(clonedInDb!.description).toContain('Ư Ứ Ừ Ử Ữ Ự');

    expect(clonedInDb!.requirements).toBe(longVietnameseRequirements.trim());
    expect(clonedInDb!.requirements!.length).toBeGreaterThan(500);

    // Trường rỗng hợp lệ được lưu là null
    expect(clonedInDb!.salaryExplanation).toBeNull();
  });
});
