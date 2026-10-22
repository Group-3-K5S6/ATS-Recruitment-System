import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

describe('S4-07: Giới thiệu ứng viên nội bộ (Employee Referral)', () => {
  let adminToken: string;
  let hrManagerToken: string;
  let recruiterToken: string;
  let hmToken: string;
  let interviewerToken: string;
  let approverToken: string;
  let candidateToken: string;

  let recruiterUserId: string;
  let hmUserId: string;
  let interviewerUserId: string;

  let testDeptId: string;
  let publishedJobId: string;
  let draftJobId: string;
  let expiredJobId: string;

  const createdReferralIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdCandidateIds: string[] = [];
  const createdJobIds: string[] = [];

  beforeAll(async () => {
    // 1. Đảm bảo bảng Referral tồn tại trong cơ sở dữ liệu kiểm thử
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Referral" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "referrerId" TEXT NOT NULL,
        "candidateId" TEXT NOT NULL,
        "applicationId" TEXT NOT NULL,
        "jobId" TEXT NOT NULL,
        "notes" TEXT,
        "source" TEXT NOT NULL DEFAULT 'INTERNAL_REFERRAL',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "Referral_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "Referral_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "Referral_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Referral_applicationId_key" ON "Referral"("applicationId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Referral_referrerId_idx" ON "Referral"("referrerId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Referral_candidateId_idx" ON "Referral"("candidateId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Referral_jobId_idx" ON "Referral"("jobId");`);

    // 2. Đăng nhập các vai trò
    const adminAuth = await loginAndGetToken('admin@ats.local');
    adminToken = adminAuth.token;

    const hrAuth = await loginAndGetToken('hr_manager@ats.local');
    hrManagerToken = hrAuth.token;

    const recAuth = await loginAndGetToken('recruiter1@ats.local');
    recruiterToken = recAuth.token;
    recruiterUserId = recAuth.user.id;

    const hmAuth = await loginAndGetToken('hiring_manager_eng@ats.local');
    hmToken = hmAuth.token;
    hmUserId = hmAuth.user.id;

    const interviewerAuth = await loginAndGetToken('interviewer1@ats.local');
    interviewerToken = interviewerAuth.token;
    interviewerUserId = interviewerAuth.user.id;

    const approverAuth = await loginAndGetToken('approver@ats.local');
    approverToken = approverAuth.token;

    const candAuth = await loginAndGetToken('candidate1@ats.local');
    candidateToken = candAuth.token;

    // 3. Tạo phòng ban test
    const dept = await prisma.department.upsert({
      where: { code: 'REF_TEST_DEPT' },
      update: {},
      create: { name: 'Phòng Thử Nghiệm Referral', code: 'REF_TEST_DEPT' },
    });
    testDeptId = dept.id;

    const now = new Date();
    const futureDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // +15 days
    const pastDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // -5 days

    // 4. Tạo Job đang mở (PUBLISHED)
    const pubJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Kỹ Sư Phần Mềm Fullstack (Referral Test)',
        departmentId: testDeptId,
        hiringManagerId: hmUserId,
        status: 'PUBLISHED',
        description: 'Mô tả vị trí tuyển dụng phục vụ test tính năng giới thiệu ứng viên nội bộ.',
        applicationDeadline: futureDate,
      },
    });
    publishedJobId = pubJob.id;
    createdJobIds.push(pubJob.id);

    // 5. Tạo Job bản nháp (DRAFT)
    const draftJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Chuyên Viên Marketing Nháp (Referral Test)',
        departmentId: testDeptId,
        hiringManagerId: hmUserId,
        status: 'DRAFT',
        description: 'Tin nháp chưa duyệt.',
      },
    });
    draftJobId = draftJob.id;
    createdJobIds.push(draftJob.id);

    // 6. Tạo Job đã hết hạn (EXPIRED)
    const expJob = await prisma.job.create({
      data: {
        id: randomUUID(),
        title: 'Nhân Viên Hết Hạn Tuyển (Referral Test)',
        departmentId: testDeptId,
        hiringManagerId: hmUserId,
        status: 'PUBLISHED',
        description: 'Tin đã quá hạn.',
        applicationDeadline: pastDate,
      },
    });
    expiredJobId = expJob.id;
    createdJobIds.push(expJob.id);
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu test
    if (createdReferralIds.length > 0) {
      await prisma.referral.deleteMany({
        where: { id: { in: createdReferralIds } },
      });
    }

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
  });

  // =========================================================================
  // PHẦN 1: NHÂN VIÊN NỘI BỘ GIỚI THIỆU ỨNG VIÊN & GẮN NGUỒN (SUCCESS)
  // =========================================================================

  describe('1. Giới thiệu ứng viên nội bộ thành công & Gắn nguồn', () => {
    it('TC01: Recruiter giới thiệu ứng viên thành công cho vị trí đang tuyển', async () => {
      const email = `ref_cand_${randomUUID().substring(0, 8)}@example.com`;
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Nguyễn Văn Ứng Viên Giới Thiệu',
          email,
          phone: '0988776655',
          cvUrl: 'https://example.com/cv-nguyen-van-a.pdf',
          notes: 'Ứng viên có 3 năm kinh nghiệm lập trình NodeJS/React.',
          currentCompany: 'Công Ty Công Nghệ Cũ',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const refData = res.body.data;
      expect(refData.jobId).toBe(publishedJobId);
      expect(refData.source).toBe('INTERNAL_REFERRAL');
      expect(refData.generalStatus).toBe('RECEIVED');
      expect(refData.statusLabel).toBe('Đã nhận hồ sơ');
      expect(refData.candidate.email).toBe(email);
      expect(refData.candidate.fullName).toBe('Nguyễn Văn Ứng Viên Giới Thiệu');
      expect(refData.referrer.id).toBe(recruiterUserId);
      expect(refData.notes).toBe('Ứng viên có 3 năm kinh nghiệm lập trình NodeJS/React.');

      createdReferralIds.push(refData.id);
      createdCandidateIds.push(refData.candidate.id);

      // Kiểm tra trong database
      const dbRef = await prisma.referral.findUnique({
        where: { id: refData.id },
        include: { application: true },
      });
      expect(dbRef).not.toBeNull();
      expect(dbRef?.source).toBe('INTERNAL_REFERRAL');
      expect(dbRef?.application.source).toBe('INTERNAL_REFERRAL');
      expect(dbRef?.application.applicantEmailNormalized).toBe(email);
      expect(dbRef?.referrerId).toBe(recruiterUserId);
      createdApplicationIds.push(dbRef!.applicationId);
    });

    it('TC02: Hiring Manager giới thiệu ứng viên thành công và không bị ảnh hưởng nếu client gửi referrerId giả mạo', async () => {
      const email = `ref_hm_${randomUUID().substring(0, 8)}@example.com`;
      const fakeReferrerId = randomUUID();

      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(hmToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Trần Thị Thu Hà',
          email,
          phone: '0912345678',
          referrerId: fakeReferrerId, // Client giả mạo referrerId
          notes: 'Đồng nghiệp cũ tại TechCorp, chuyên môn vững.',
        });

      expect(res.status).toBe(201);
      const refData = res.body.data;
      // Người giới thiệu phải là HM thực tế từ token, không phải fakeReferrerId
      expect(refData.referrer.id).toBe(hmUserId);
      expect(refData.referrer.id).not.toBe(fakeReferrerId);

      createdReferralIds.push(refData.id);
      createdCandidateIds.push(refData.candidate.id);

      const dbRef = await prisma.referral.findUnique({
        where: { id: refData.id },
      });
      expect(dbRef?.referrerId).toBe(hmUserId);
      createdApplicationIds.push(dbRef!.applicationId);
    });

    it('TC03: Interviewer giới thiệu ứng viên thành công', async () => {
      const email = `ref_interviewer_${randomUUID().substring(0, 8)}@example.com`;
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(interviewerToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Lê Hoàng Nam',
          email,
          notes: 'Thành viên cùng câu lạc bộ mã nguồn mở.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.referrer.id).toBe(interviewerUserId);

      createdReferralIds.push(res.body.data.id);
      createdCandidateIds.push(res.body.data.candidate.id);

      const dbRef = await prisma.referral.findUnique({
        where: { id: res.body.data.id },
      });
      createdApplicationIds.push(dbRef!.applicationId);
    });

    it('TC04: Approver và HR Manager đều có quyền giới thiệu ứng viên', async () => {
      const emailApprover = `ref_appr_${randomUUID().substring(0, 8)}@example.com`;
      const resApprover = await request(app)
        .post('/api/referrals')
        .set(authHeader(approverToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Phạm Đức Minh',
          email: emailApprover,
        });
      expect(resApprover.status).toBe(201);
      createdReferralIds.push(resApprover.body.data.id);
      createdCandidateIds.push(resApprover.body.data.candidate.id);

      const emailHr = `ref_hr_${randomUUID().substring(0, 8)}@example.com`;
      const resHr = await request(app)
        .post('/api/referrals')
        .set(authHeader(hrManagerToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Hoàng Kim Ngân',
          email: emailHr,
        });
      expect(resHr.status).toBe(201);
      createdReferralIds.push(resHr.body.data.id);
      createdCandidateIds.push(resHr.body.data.candidate.id);
    });
  });

  // =========================================================================
  // PHẦN 2: VALIDATION & VỊ TRÍ TUYỂN DỤNG HỢP LỆ
  // =========================================================================

  describe('2. Kiểm tra dữ liệu đầu vào và vị trí tuyển dụng hợp lệ', () => {
    it('TC05: Từ chối khi thiếu họ tên hoặc họ tên quá ngắn', async () => {
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: publishedJobId,
          fullName: 'A', // Dưới 2 ký tự
          email: 'valid@example.com',
        });

      expect(res.status).toBe(400);
    });

    it('TC06: Từ chối khi email không đúng định dạng', async () => {
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Nguyễn Văn B',
          email: 'invalid-email-format',
        });

      expect(res.status).toBe(400);
    });

    it('TC07: Từ chối khi cvUrl không phải là đường dẫn URL hợp lệ', async () => {
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Nguyễn Văn B',
          email: 'valid_email@example.com',
          cvUrl: 'not-a-valid-url',
        });

      expect(res.status).toBe(400);
    });

    it('TC08: Trả về 404 khi vị trí tuyển dụng không tồn tại', async () => {
      const nonExistentJobId = randomUUID();
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: nonExistentJobId,
          fullName: 'Ứng Viên Test',
          email: 'test404@example.com',
        });

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('NOT_FOUND');
    });

    it('TC09: Từ chối khi vị trí chưa được xuất bản (trạng thái DRAFT)', async () => {
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: draftJobId,
          fullName: 'Ứng Viên Thử Nghiệm',
          email: 'test_draft@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('JOB_NOT_OPEN');
    });

    it('TC10: Từ chối khi vị trí đã hết hạn nhận hồ sơ (applicationDeadline trong quá khứ)', async () => {
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: expiredJobId,
          fullName: 'Ứng Viên Quá Hạn',
          email: 'test_expired@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('JOB_DEADLINE_EXPIRED');
    });
  });

  // =========================================================================
  // PHẦN 3: PHÒNG CHỐNG TRÙNG LẶP HỒ SƠ VÀ GIỚI THIỆU
  // =========================================================================

  describe('3. Chống hồ sơ trùng lặp hoặc giới thiệu trùng cho cùng một vị trí', () => {
    it('TC11: Từ chối 409 khi giới thiệu trùng cùng một ứng viên cho cùng một vị trí', async () => {
      const email = `dup_test_${randomUUID().substring(0, 8)}@example.com`;

      // Giới thiệu lần 1
      const res1 = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Ứng Viên Trùng Lặp',
          email,
          notes: 'Lần 1',
        });
      expect(res1.status).toBe(201);
      createdReferralIds.push(res1.body.data.id);
      createdCandidateIds.push(res1.body.data.candidate.id);

      // Giới thiệu lần 2 (bởi cùng hoặc người khác) vào cùng vị trí
      const res2 = await request(app)
        .post('/api/referrals')
        .set(authHeader(hmToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Ứng Viên Trùng Lặp Tên Khác',
          email,
          notes: 'Lần 2 cố ý trùng',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error?.code).toBe('DUPLICATE_APPLICATION');
    });

    it('TC12: Từ chối khi ứng viên đã tự nộp hồ sơ vào vị trí đó trước đó', async () => {
      const email = `applied_before_${randomUUID().substring(0, 8)}@example.com`;

      // Tạo ứng viên đã có hồ sơ nộp
      const cand = await prisma.candidate.create({
        data: {
          fullName: 'Ứng Viên Đã Tự Nộp',
          email,
        },
      });
      createdCandidateIds.push(cand.id);

      const appRec = await prisma.application.create({
        data: {
          candidateId: cand.id,
          jobId: publishedJobId,
          stage: 'SCREENING',
          status: 'ACTIVE',
        },
      });
      createdApplicationIds.push(appRec.id);

      // Cố tình giới thiệu ứng viên này cho vị trí đã nộp
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Ứng Viên Đã Tự Nộp',
          email,
          notes: 'Tôi muốn giới thiệu người này',
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('DUPLICATE_APPLICATION');
    });

    it('TC13: Cho phép giới thiệu cùng một ứng viên cho hai vị trí tuyển dụng KHÁC NHAU', async () => {
      // Tạo thêm 1 Job PUBLISHED khác
      const anotherJob = await prisma.job.create({
        data: {
          id: randomUUID(),
          title: 'Vị Trí Khác Đang Mở (Referral Test)',
          departmentId: testDeptId,
          hiringManagerId: hmUserId,
          status: 'PUBLISHED',
          description: 'Vị trí thứ hai.',
        },
      });
      createdJobIds.push(anotherJob.id);

      const email = `multi_job_${randomUUID().substring(0, 8)}@example.com`;

      // Giới thiệu vào job 1
      const res1 = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Ứng Viên Ứng Tuyển Nhiều Vị Trí',
          email,
        });
      expect(res1.status).toBe(201);
      createdReferralIds.push(res1.body.data.id);
      createdCandidateIds.push(res1.body.data.candidate.id);

      // Giới thiệu vào job 2
      const res2 = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: anotherJob.id,
          fullName: 'Ứng Viên Ứng Tuyển Nhiều Vị Trí',
          email,
        });
      expect(res2.status).toBe(201);
      createdReferralIds.push(res2.body.data.id);

      // Cả 2 đều trỏ đến cùng 1 bản ghi Candidate nhưng có 2 Application và 2 Referral riêng biệt
      expect(res1.body.data.candidate.id).toBe(res2.body.data.candidate.id);
    });
  });

  // =========================================================================
  // PHẦN 4: THEO DÕI KẾT QUẢ GIỚI THIỆU & BẢO MẬT PHẠM VI (RBAC / SCOPE)
  // =========================================================================

  describe('4. Theo dõi kết quả giới thiệu & Bảo mật thông tin (Scope / Privacy)', () => {
    let recruiterRefId: string;
    let hmRefId: string;

    beforeAll(async () => {
      // Tạo 1 referral do Recruiter tạo
      const resRec = await request(app)
        .post('/api/referrals')
        .set(authHeader(recruiterToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Ứng Viên Của Recruiter',
          email: `rec_cand_${randomUUID().substring(0, 6)}@example.com`,
          notes: 'Ghi chú của Recruiter',
        });
      recruiterRefId = resRec.body.data.id;
      createdReferralIds.push(recruiterRefId);
      createdCandidateIds.push(resRec.body.data.candidate.id);

      // Tạo 1 referral do Hiring Manager tạo
      const resHm = await request(app)
        .post('/api/referrals')
        .set(authHeader(hmToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Ứng Viên Của HM',
          email: `hm_cand_${randomUUID().substring(0, 6)}@example.com`,
          notes: 'Ghi chú của HM',
        });
      hmRefId = resHm.body.data.id;
      createdReferralIds.push(hmRefId);
      createdCandidateIds.push(resHm.body.data.candidate.id);
    });

    it('TC14: Người giới thiệu xem được danh sách hồ sơ chính mình đã giới thiệu với thông tin tổng quát', async () => {
      const res = await request(app)
        .get('/api/referrals/my-referrals')
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.pagination).toBeDefined();

      const items = res.body.data.items;
      // Phải có hồ sơ recruiter vừa tạo
      const found = items.find((it: any) => it.id === recruiterRefId);
      expect(found).toBeDefined();
      expect(found.candidateName).toBe('Ứng Viên Của Recruiter');
      expect(found.jobTitle).toBe('Kỹ Sư Phần Mềm Fullstack (Referral Test)');
      expect(found.generalStatus).toBe('RECEIVED');
      expect(found.statusLabel).toBe('Đã nhận hồ sơ');
      expect(found.source).toBe('INTERNAL_REFERRAL');
      expect(found.notes).toBe('Ghi chú của Recruiter');
      expect(found.referralDate).toBeDefined();

      // Bảo vệ thông tin nhạy cảm: không lộ evaluation, score, recruiter internal notes, salary
      expect(found.evaluations).toBeUndefined();
      expect(found.score).toBeUndefined();
      expect(found.technicalNotes).toBeUndefined();
      expect(found.culturalNotes).toBeUndefined();
      expect(found.baseSalary).toBeUndefined();
    });

    it('TC15: Phân quyền phạm vi: Recruiter KHÔNG THỂ nhìn thấy hồ sơ do HM giới thiệu trong my-referrals', async () => {
      const res = await request(app)
        .get('/api/referrals/my-referrals')
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      const hmFound = items.find((it: any) => it.id === hmRefId);
      expect(hmFound).toBeUndefined();
    });

    it('TC16: Phân quyền phạm vi: HM KHÔNG THỂ nhìn thấy hồ sơ do Recruiter giới thiệu trong my-referrals', async () => {
      const res = await request(app)
        .get('/api/referrals/my-referrals')
        .set(authHeader(hmToken));

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      const recFound = items.find((it: any) => it.id === recruiterRefId);
      expect(recFound).toBeUndefined();
    });

    it('TC17: Người giới thiệu xem chi tiết hồ sơ mình đã giới thiệu thành công', async () => {
      const res = await request(app)
        .get(`/api/referrals/my-referrals/${recruiterRefId}`)
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(recruiterRefId);
      expect(res.body.data.candidateName).toBe('Ứng Viên Của Recruiter');
      expect(res.body.data.generalStatus).toBe('RECEIVED');
    });

    it('TC18: Chống IDOR: HM cố tình truy cập chi tiết referral của Recruiter bị từ chối 403 FORBIDDEN_SCOPE', async () => {
      const res = await request(app)
        .get(`/api/referrals/my-referrals/${recruiterRefId}`)
        .set(authHeader(hmToken));

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('FORBIDDEN_SCOPE');
    });

    it('TC19: Hỗ trợ phân trang danh sách my-referrals', async () => {
      const res = await request(app)
        .get('/api/referrals/my-referrals?page=1&limit=2')
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('TC20: Cập nhật stage tuyển dụng sang INTERVIEW phản ánh đúng generalStatus = INTERVIEW', async () => {
      // Tìm application của recruiterRefId
      const ref = await prisma.referral.findUnique({
        where: { id: recruiterRefId },
      });

      await prisma.application.update({
        where: { id: ref!.applicationId },
        data: { stage: 'INTERVIEW' },
      });

      const res = await request(app)
        .get(`/api/referrals/my-referrals/${recruiterRefId}`)
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(200);
      expect(res.body.data.generalStatus).toBe('INTERVIEW');
      expect(res.body.data.statusLabel).toBe('Mời phỏng vấn');
    });

    it('TC21: Khi application chuyển sang REJECTED, generalStatus phản ánh COMPLETED và không lộ lý do từ chối nhạy cảm', async () => {
      const ref = await prisma.referral.findUnique({
        where: { id: recruiterRefId },
      });

      await prisma.application.update({
        where: { id: ref!.applicationId },
        data: { status: 'REJECTED' },
      });

      const res = await request(app)
        .get(`/api/referrals/my-referrals/${recruiterRefId}`)
        .set(authHeader(recruiterToken));

      expect(res.status).toBe(200);
      expect(res.body.data.generalStatus).toBe('COMPLETED');
      expect(res.body.data.statusLabel).toBe('Không phù hợp');
    });
  });

  // =========================================================================
  // PHẦN 5: BẢO VỆ XÁC THỰC VÀ PHÂN QUYỀN (UNAUTHORIZED & FORBIDDEN)
  // =========================================================================

  describe('5. Xác thực và Phân quyền truy cập', () => {
    it('TC22: Người dùng chưa đăng nhập gọi POST /api/referrals trả về 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/referrals')
        .send({
          jobId: publishedJobId,
          fullName: 'Ứng Viên Nặc Danh',
          email: 'anon@example.com',
        });

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('TC23: Người dùng chưa đăng nhập gọi GET /api/referrals/my-referrals trả về 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/referrals/my-referrals');
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });

    it('TC24: Ứng viên bên ngoài (role CANDIDATE) gọi POST /api/referrals bị từ chối 403 FORBIDDEN_ROLE', async () => {
      const res = await request(app)
        .post('/api/referrals')
        .set(authHeader(candidateToken))
        .send({
          jobId: publishedJobId,
          fullName: 'Người Ngoài Cố Giới Thiệu',
          email: 'external@example.com',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('FORBIDDEN_ROLE');
    });

    it('TC25: Ứng viên bên ngoài (role CANDIDATE) gọi GET /api/referrals/my-referrals bị từ chối 403 FORBIDDEN_ROLE', async () => {
      const res = await request(app)
        .get('/api/referrals/my-referrals')
        .set(authHeader(candidateToken));

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('FORBIDDEN_ROLE');
    });

    it('TC26: HR Manager và Admin xem được danh sách quản lý tất cả giới thiệu GET /api/referrals', async () => {
      const resHr = await request(app)
        .get('/api/referrals')
        .set(authHeader(hrManagerToken));

      expect(resHr.status).toBe(200);
      expect(resHr.body.data.items).toBeInstanceOf(Array);
      expect(resHr.body.data.items.length).toBeGreaterThanOrEqual(1);
      // Danh sách quản lý có chứa thông tin người giới thiệu
      expect(resHr.body.data.items[0].referrer).toBeDefined();

      const resAdmin = await request(app)
        .get('/api/referrals')
        .set(authHeader(adminToken));
      expect(resAdmin.status).toBe(200);
    });

    it('TC27: Interviewer không có quyền xem danh sách quản lý tất cả giới thiệu GET /api/referrals (403)', async () => {
      const res = await request(app)
        .get('/api/referrals')
        .set(authHeader(interviewerToken));

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('FORBIDDEN_ROLE');
    });
  });
});
