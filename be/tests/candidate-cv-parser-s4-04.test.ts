import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { loginAndGetToken, authHeader } from './test-helper';

function createSyntheticPdf(text: string): Buffer {
  const lines = text.split('\n');
  const streamLines = lines
    .map((l, i) => {
      const escaped = l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      return i === 0 ? `72 712 Td (${escaped}) Tj` : `0 -24 Td (${escaped}) Tj`;
    })
    .join('\n');
  const streamContent = `BT\n/F1 12 Tf\n${streamLines}\nET`;
  const streamLength = Buffer.byteLength(streamContent);
  const pdfString =
    `%PDF-1.4\n` +
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n` +
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n` +
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj\n` +
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n` +
    `xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000259 00000 n \n0000000366 00000 n \n` +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n443\n%%EOF`;
  return Buffer.from(pdfString);
}

describe('SCRUM S4-04: Bóc tách thông tin ứng viên từ CV PDF cho Nhân viên tuyển dụng', () => {
  let recruiterToken: string;
  let candidateToken: string;
  const createdCandidateIds: string[] = [];

  beforeAll(async () => {
    const recAuth = await loginAndGetToken('recruiter1@ats.local');
    recruiterToken = recAuth.token;

    const candAuth = await loginAndGetToken('candidate1@ats.local');
    candidateToken = candAuth.token;
  });

  afterAll(async () => {
    if (createdCandidateIds.length > 0) {
      await prisma.candidate.deleteMany({
        where: { id: { in: createdCandidateIds } },
      });
    }
  });

  it('TC01: Recruiter bóc tách thành công họ tên, email, số điện thoại từ tệp CV PDF', async () => {
    const pdfBuffer = createSyntheticPdf('Ho va ten: Nguyen Van An\nEmail: nguyen.van.an@example.com\nSDT: 0912345678');

    const res = await request(app)
      .post('/api/candidates/parse-cv')
      .set(authHeader(recruiterToken))
      .attach('cv', pdfBuffer, 'candidate_cv.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.fullName).toBe('Nguyen Van An');
    expect(res.body.data.email).toBe('nguyen.van.an@example.com');
    expect(res.body.data.phone).toBe('0912345678');
    expect(res.body.data.isParsed).toBe(true);
  });

  it('TC02: Recruiter bóc tách CV qua Base64 JSON payload', async () => {
    const pdfBuffer = createSyntheticPdf('Full Name: Tran Thi Mai\nEmail: mai.tran@test.vn\nPhone: +84987654321');
    const base64 = pdfBuffer.toString('base64');

    const res = await request(app)
      .post('/api/candidates/parse-cv')
      .set(authHeader(recruiterToken))
      .send({
        cvBase64: `data:application/pdf;base64,${base64}`,
        filename: 'cv_mai.pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fullName).toBe('Tran Thi Mai');
    expect(res.body.data.email).toBe('mai.tran@test.vn');
    expect(res.body.data.phone).toBe('+84987654321');
  });

  it('TC03: Từ chối nếu tệp không phải PDF (INVALID_PDF_FORMAT)', async () => {
    const fakeBuffer = Buffer.from('This is a plain text file, not a PDF');

    const res = await request(app)
      .post('/api/candidates/parse-cv')
      .set(authHeader(recruiterToken))
      .attach('cv', fakeBuffer, 'fake.pdf');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('INVALID_PDF_FORMAT');
  });

  it('TC04: Bóc tách thất bại (PDF trống hoặc ảnh scan không chữ) KHÔNG làm lỗi hệ thống và trả về hướng dẫn nhập thủ công', async () => {
    // PDF không có nội dung chữ (mô phỏng ảnh scan)
    const emptyPdf = Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
      `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n` +
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n` +
      `xref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n120\n%%EOF`
    );

    const res = await request(app)
      .post('/api/candidates/parse-cv')
      .set(authHeader(recruiterToken))
      .attach('cv', emptyPdf, 'scanned_cv.pdf');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isParsed).toBe(false);
    expect(res.body.data.fullName).toBe('');
    expect(res.body.data.email).toBe('');
    expect(res.body.data.phone).toBe('');
    expect(res.body.data.message).toMatch(/thủ công/i);
  });

  it('TC05: Yêu cầu xác thực khi gọi API bóc tách CV (401 khi không có token)', async () => {
    const pdfBuffer = createSyntheticPdf('Nguyen Van A\na@test.com');

    const res = await request(app)
      .post('/api/candidates/parse-cv')
      .attach('cv', pdfBuffer, 'cv.pdf');

    expect(res.status).toBe(401);
  });

  it('TC06: Recruiter xác nhận và lưu thông tin ứng viên vào CSDL sau khi kiểm tra/sửa', async () => {
    const uniqueEmail = `recruiter_parsed_${Date.now()}@example.com`;

    const res = await request(app)
      .post('/api/candidates')
      .set(authHeader(recruiterToken))
      .send({
        fullName: 'Nguyễn Văn Kiểm Tra',
        email: uniqueEmail,
        phone: '0988776655',
        currentCompany: 'Công ty Công nghệ ABC',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fullName).toBe('Nguyễn Văn Kiểm Tra');
    expect(res.body.data.email).toBe(uniqueEmail);

    createdCandidateIds.push(res.body.data.id);
  });

  it('TC07: Recruiter có thể tự nhập thủ công và lưu hồ sơ khi bóc tách thất bại (không làm hỏng luồng nộp hồ sơ)', async () => {
    const manualEmail = `manual_entry_${Date.now()}@example.com`;

    const res = await request(app)
      .post('/api/candidates')
      .set(authHeader(recruiterToken))
      .send({
        fullName: 'Trần Văn Thủ Công',
        email: manualEmail,
        phone: '0911223344',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();

    createdCandidateIds.push(res.body.data.id);
  });
});
