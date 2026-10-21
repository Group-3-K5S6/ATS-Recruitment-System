import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app';
import { prisma } from '../src/database/prisma';
import { resetRateLimiter } from '../src/middleware/rate-limiter';

const app = createApp();

// Sample valid PDF buffer (%PDF-1.4 header)
const samplePdfBuffer = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
);

// Sample valid DOCX buffer (PK\x03\x04 zip header with Word packaging)
const sampleDocxBuffer = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('[Content_Types].xml word/document.xml sample docx content representing office open xml'),
]);

// Generic zip file without DOCX structure
const genericZipBuffer = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('plain zip contents without any word document packaging or content types'),
]);

// Fake fake.pdf with text content (invalid magic bytes)
const fakePdfBuffer = Buffer.from('This is not a real PDF file, just text pretending to be PDF.');

describe('SCRUM-132: Public Job Application & CV Upload', () => {
  let publishedJobId: string;
  let closedJobId: string;
  let draftJobId: string;
  let testDepartmentId: string;
  let testUserId: string;

  beforeAll(async () => {
    // 1. Ensure test department
    const dept = await prisma.department.upsert({
      where: { code: 'TEST_S4_DEPT' },
      update: {},
      create: { name: 'Phòng Phát triển SCRUM-132', code: 'TEST_S4_DEPT' },
    });
    testDepartmentId = dept.id;

    // 2. Ensure test user
    const user = await prisma.user.findFirst();
    testUserId = user!.id;

    // 3. Create published job accepting applications
    const publishedJob = await prisma.job.create({
      data: {
        title: 'Senior Backend Engineer (SCRUM-132)',
        description: 'Vị trí thử nghiệm nộp hồ sơ công khai SCRUM-132',
        location: 'Hà Nội',
        workMode: 'HYBRID',
        status: 'PUBLISHED',
        approvedAt: new Date(),
        publishedAt: new Date(),
        departmentId: testDepartmentId,
        hiringManagerId: testUserId,
      },
    });
    publishedJobId = publishedJob.id;

    // 4. Create an expired/closed job (applicationDeadline in the past)
    const closedJob = await prisma.job.create({
      data: {
        title: 'Expired Job (SCRUM-132)',
        description: 'Vị trí đã hết hạn nộp hồ sơ',
        status: 'PUBLISHED',
        approvedAt: new Date(),
        publishedAt: new Date(),
        applicationDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        departmentId: testDepartmentId,
        hiringManagerId: testUserId,
      },
    });
    closedJobId = closedJob.id;

    // 5. Create a draft job (not published)
    const draftJob = await prisma.job.create({
      data: {
        title: 'Draft Job (SCRUM-132)',
        description: 'Vị trí bản nháp chưa công khai',
        status: 'DRAFT',
        departmentId: testDepartmentId,
        hiringManagerId: testUserId,
      },
    });
    draftJobId = draftJob.id;
  });

  afterAll(async () => {
    // Cleanup created test records
    await prisma.application.deleteMany({
      where: { jobId: { in: [publishedJobId, closedJobId, draftJobId] } },
    });
    await prisma.job.deleteMany({
      where: { id: { in: [publishedJobId, closedJobId, draftJobId] } },
    });
  });

  beforeEach(() => {
    resetRateLimiter();
  });

  // --- 1. SUCCESSFUL SUBMISSIONS ---
  it('successfully submits job application with valid PDF CV', async () => {
    const email = `candidate.pdf.${Date.now()}@example.com`;
    const res = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Nguyễn Văn Ứng Viên')
      .field('email', email)
      .field('phone', '0987654321')
      .field('source', 'LinkedIn')
      .field('coverLetter', 'Tôi rất mong muốn được cống hiến cho công ty.')
      .attach('cv', samplePdfBuffer, 'resume.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.trackingCode).toMatch(/^ATS-\d{4}-[A-Z0-9]{6}$/);
    expect(res.body.data.fullName).toBe('Nguyễn Văn Ứng Viên');
    expect(res.body.data.email).toBe(email);
    expect(res.body.data.jobTitle).toContain('Senior Backend Engineer');

    // Verify database persistence
    const savedApp = await prisma.application.findUnique({
      where: { trackingCode: res.body.data.trackingCode },
      include: { candidate: true },
    });
    expect(savedApp).not.toBeNull();
    expect(savedApp?.stage).toBe('APPLIED');
    expect(savedApp?.status).toBe('ACTIVE');
    expect(savedApp?.coverLetter).toBe('Tôi rất mong muốn được cống hiến cho công ty.');
    expect(savedApp?.source).toBe('LinkedIn');
    expect(savedApp?.cvUrl).toContain('/uploads/cvs/');

    // Verify file exists on disk and cleanup
    if (savedApp?.cvUrl) {
      const filePath = path.join(process.cwd(), savedApp.cvUrl);
      expect(fs.existsSync(filePath)).toBe(true);
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  });

  it('successfully submits job application with valid DOCX CV', async () => {
    const email = `candidate.docx.${Date.now()}@example.com`;
    const res = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Trần Thị Thu')
      .field('email', email)
      .field('phone', '0912345678')
      .field('source', 'Facebook')
      .attach('cv', sampleDocxBuffer, 'curriculum_vitae.docx');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.trackingCode).toMatch(/^ATS-\d{4}-[A-Z0-9]{6}$/);

    const savedApp = await prisma.application.findUnique({
      where: { trackingCode: res.body.data.trackingCode },
    });
    expect(savedApp).not.toBeNull();
    if (savedApp?.cvUrl) {
      const filePath = path.join(process.cwd(), savedApp.cvUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  it('supports POST /api/public/jobs/apply with jobId in body', async () => {
    const email = `candidate.body.${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/public/jobs/apply')
      .field('jobId', publishedJobId)
      .field('fullName', 'Lê Hoàng Nam')
      .field('email', email)
      .field('phone', '0909123456')
      .attach('cv', samplePdfBuffer, 'cv_nam.pdf');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.trackingCode).toBeDefined();

    const savedApp = await prisma.application.findUnique({
      where: { trackingCode: res.body.data.trackingCode },
    });
    if (savedApp?.cvUrl) {
      const filePath = path.join(process.cwd(), savedApp.cvUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  // --- 2. TRACKING CODE LOOKUP ---
  it('allows candidate to look up application status with tracking code and masks email', async () => {
    const email = `test.lookup.${Date.now()}@example.com`;
    const submitRes = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Phạm Minh Đức')
      .field('email', email)
      .attach('cv', samplePdfBuffer, 'duc.pdf');

    const trackingCode = submitRes.body.data.trackingCode;

    // Track
    const trackRes = await request(app).get(`/api/public/jobs/applications/track/${trackingCode}`);
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.success).toBe(true);
    expect(trackRes.body.data.trackingCode).toBe(trackingCode);
    expect(trackRes.body.data.stage).toBe('APPLIED');
    expect(trackRes.body.data.candidate.fullName).toBe('Phạm Minh Đức');
    expect(trackRes.body.data.candidate.maskedEmail).toMatch(/^t\*\*\*.*@example\.com$/);
    expect(trackRes.body.data.job.title).toContain('Senior Backend Engineer');

    // Clean up file
    const savedApp = await prisma.application.findUnique({ where: { trackingCode } });
    if (savedApp?.cvUrl) {
      const filePath = path.join(process.cwd(), savedApp.cvUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('returns 404 when looking up non-existent tracking code', async () => {
    const res = await request(app).get('/api/public/jobs/applications/track/ATS-9999-NOTFOUND');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('APPLICATION_NOT_FOUND');
  });

  // --- 3. INPUT VALIDATION ---
  it('rejects submission with missing fullName', async () => {
    const res = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', '')
      .field('email', 'valid@example.com')
      .attach('cv', samplePdfBuffer, 'cv.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Họ và tên');
  });

  it('rejects submission with invalid email format', async () => {
    const res = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Nguyễn Test')
      .field('email', 'not-an-email')
      .attach('cv', samplePdfBuffer, 'cv.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('email');
  });

  it('rejects submission without CV attachment', async () => {
    const res = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Nguyễn Không CV')
      .field('email', 'no-cv@example.com');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('MISSING_CV');
  });

  // --- 4. CV SECURITY & TYPE RESTRICTIONS ---
  it('rejects CV with unsupported extension (.txt, .png, .exe)', async () => {
    const textBuffer = Buffer.from('plain text resume');
    const res = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Ứng Viên Sai Định Dạng')
      .field('email', 'badformat@example.com')
      .attach('cv', textBuffer, 'resume.txt');

    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CV_FORMAT');
  });

  it('rejects spoofed CV named .pdf with invalid magic bytes', async () => {
    const res = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Fake PDF Candidate')
      .field('email', 'fake-pdf@example.com')
      .attach('cv', fakePdfBuffer, 'fake.pdf');

    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CV_SIGNATURE');
  });

  it('rejects CV exceeding 10 MB limit', async () => {
    // 10 MB + 1 byte buffer
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024, 0x25);
    const res = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'File Quá Dung Lượng')
      .field('email', 'oversize@example.com')
      .attach('cv', largeBuffer, 'huge.pdf');

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CV_TOO_LARGE');
  });

  // --- 5. JOB ELIGIBILITY RESTRICTIONS ---
  it('returns 404 when applying to a non-existent job ID', async () => {
    const res = await request(app)
      .post('/api/public/jobs/non-existent-uuid/apply')
      .field('fullName', 'Ứng Viên Lạc Lối')
      .field('email', 'lost@example.com')
      .attach('cv', samplePdfBuffer, 'cv.pdf');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  it('returns 404 when applying to a draft job', async () => {
    const res = await request(app)
      .post(`/api/public/jobs/${draftJobId}/apply`)
      .field('fullName', 'Ứng Viên Nộp Nháp')
      .field('email', 'draft@example.com')
      .attach('cv', samplePdfBuffer, 'cv.pdf');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  it('returns 404 when applying to an expired job', async () => {
    const res = await request(app)
      .post(`/api/public/jobs/${closedJobId}/apply`)
      .field('fullName', 'Ứng Viên Nộp Muộn')
      .field('email', 'late@example.com')
      .attach('cv', samplePdfBuffer, 'cv.pdf');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  // --- 6. DUPLICATE APPLICATION PREVENTION ---
  it('rejects duplicate application when same email applies to the same job twice', async () => {
    const duplicateEmail = `duplicate.${Date.now()}@example.com`;

    // First submission: should succeed
    const firstRes = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Ứng Viên Nộp Lần 1')
      .field('email', duplicateEmail)
      .attach('cv', samplePdfBuffer, 'cv1.pdf');

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.success).toBe(true);

    // Second submission with same email to same job: must be rejected with 409 Conflict
    const secondRes = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Ứng Viên Nộp Lần 2 (Trùng)')
      .field('email', duplicateEmail)
      .attach('cv', samplePdfBuffer, 'cv2.pdf');

    expect(secondRes.status).toBe(409);
    expect(secondRes.body.success).toBe(false);
    expect(secondRes.body.error.code).toBe('DUPLICATE_APPLICATION');
    expect(secondRes.body.error.message).toContain('trùng lặp');

    // Cleanup disk file from first application
    const savedApp = await prisma.application.findUnique({
      where: { trackingCode: firstRes.body.data.trackingCode },
    });
    if (savedApp?.cvUrl) {
      const filePath = path.join(process.cwd(), savedApp.cvUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  // --- 7. RATE LIMITING (ANTI-SPAM) ---
  it('blocks excessive submissions from the same IP with HTTP 429', async () => {
    // Submit 10 times to hit the limit
    for (let i = 0; i < 10; i++) {
      const uniqueEmail = `spam.${i}.${Date.now()}@example.com`;
      const res = await request(app)
        .post(`/api/public/jobs/${publishedJobId}/apply`)
        .field('fullName', `Spam Bot ${i}`)
        .field('email', uniqueEmail)
        .attach('cv', samplePdfBuffer, `spam_${i}.pdf`);

      expect(res.status).toBe(201);

      // Cleanup files
      const trackingCode = res.body.data.trackingCode;
      const appRecord = await prisma.application.findUnique({ where: { trackingCode } });
      if (appRecord?.cvUrl) {
        const filePath = path.join(process.cwd(), appRecord.cvUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }

    // 11th submission from the same IP should be blocked by rate limiter
    const blockedRes = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Spam Bot 11')
      .field('email', `spam.11.${Date.now()}@example.com`)
      .attach('cv', samplePdfBuffer, 'spam_11.pdf');

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.success).toBe(false);
    expect(blockedRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(blockedRes.headers['retry-after']).toBeDefined();
  });

  // --- 8. ADVANCED SECURITY & DOCX STRUCTURE VERIFICATION ---
  it('rejects generic zip files renamed to .docx without Word packaging structure', async () => {
    const res = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Kẻ Giả Mạo DOCX')
      .field('email', 'fake-docx@example.com')
      .attach('cv', genericZipBuffer, 'fake_word.docx');

    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CV_SIGNATURE');
    expect(res.body.error.message).toContain('DOCX hợp lệ');
  });

  // --- 9. SECURE FILE SERVING & PATH TRAVERSAL DEFENSE ---
  it('serves uploaded CV file securely and applies nosniff & CSP headers', async () => {
    const email = `download.${Date.now()}@example.com`;
    const submitRes = await request(app)
      .post(`/api/public/jobs/${publishedJobId}/apply`)
      .field('fullName', 'Ứng Viên Tải Tệp')
      .field('email', email)
      .attach('cv', samplePdfBuffer, 'secure_cv.pdf');

    expect(submitRes.status).toBe(201);
    const cvUrl = submitRes.body.data.cvUrl; // e.g. /uploads/cvs/cv_...pdf
    expect(cvUrl).toBeDefined();

    const getRes = await request(app).get(cvUrl);
    expect(getRes.status).toBe(200);
    expect(getRes.headers['x-content-type-options']).toBe('nosniff');
    expect(getRes.headers['content-security-policy']).toBe("default-src 'none'");

    // Clean up
    const filePath = path.join(process.cwd(), cvUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('rejects path traversal and unauthorized filenames on /uploads/cvs/:filename', async () => {
    // Attempting path traversal
    const traversalRes = await request(app).get('/uploads/cvs/..%2fpackage.json');
    expect([400, 404]).toContain(traversalRes.status);

    // Invalid non-CV filename format
    const invalidNameRes = await request(app).get('/uploads/cvs/arbitrary_script.js');
    expect(invalidNameRes.status).toBe(400);
    expect(invalidNameRes.body.error.code).toBe('INVALID_FILENAME');
  });

  // --- 10. CONCURRENT SUBMISSION RACE-CONDITION SAFETY ---
  it('prevents duplicate applications under simultaneous concurrent requests with same email', async () => {
    const raceEmail = `race.condition.${Date.now()}@example.com`;

    const submitFn = () =>
      request(app)
        .post(`/api/public/jobs/${publishedJobId}/apply`)
        .field('fullName', 'Ứng Viên Gửi Đồng Thời')
        .field('email', raceEmail)
        .attach('cv', samplePdfBuffer, 'race.pdf');

    // Fire 2 simultaneous requests in parallel
    const [resA, resB] = await Promise.all([submitFn(), submitFn()]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one must succeed (201) and the other must be rejected (409 Conflict)
    expect(statuses).toEqual([201, 409]);

    // Check database has exactly 1 application for this candidate & job
    const candidate = await prisma.candidate.findFirst({ where: { email: raceEmail } });
    expect(candidate).not.toBeNull();
    const count = await prisma.application.count({
      where: { candidateId: candidate!.id, jobId: publishedJobId },
    });
    expect(count).toBe(1);

    // Cleanup files
    const appRecord = await prisma.application.findFirst({ where: { candidateId: candidate!.id } });
    if (appRecord?.cvUrl) {
      const filePath = path.join(process.cwd(), appRecord.cvUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });
});
