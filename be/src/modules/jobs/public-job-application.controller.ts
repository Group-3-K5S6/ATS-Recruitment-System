import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { prisma } from '../../database/prisma';
import { successResponse, errorResponse } from '../../utils/response';
import { publicJobApplicationSchema } from './public-job-application.schema';
import { validateCvMagicBytes } from './cv-upload.middleware';
import { getClientIp } from '../../middleware/rate-limiter';
import { sendApplicationConfirmationEmail } from '../../utils/email';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'cvs');

/**
 * Generates a unique, non-sequential, cryptographically strong tracking code.
 * Format: ATS-{YEAR}-{6 RANDOM ALPHANUMERIC CHARS}
 * Example: ATS-2026-X8K9M2
 */
function generateTrackingCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const year = new Date().getFullYear();
  const bytes = crypto.randomBytes(6);
  let randomSegment = '';
  for (let i = 0; i < 6; i++) {
    randomSegment += chars[bytes[i] % chars.length];
  }
  return `ATS-${year}-${randomSegment}`;
}

export class PublicJobApplicationController {
  /**
   * POST /api/public/jobs/:id/apply
   * Handles public, unauthenticated job application submission with CV upload.
   */
  static async submitApplication(req: Request, res: Response): Promise<void> {
    let savedFilePath: string | null = null;

    try {
      // 1. Determine target Job ID
      const targetJobId = req.params.id;
      if (!targetJobId || typeof targetJobId !== 'string' || !targetJobId.trim()) {
        errorResponse(res, 'Vui lòng chỉ định vị trí tuyển dụng cần ứng tuyển.', 400, 'MISSING_JOB_ID');
        return;
      }

      // 2. Validate form input fields
      const parseResult = publicJobApplicationSchema.safeParse({
        ...req.body,
        jobId: targetJobId,
      });

      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0]?.message || 'Dữ liệu không hợp lệ.';
        errorResponse(res, firstError, 400, 'VALIDATION_ERROR', parseResult.error.flatten());
        return;
      }

      const { fullName, email, phone, source, coverLetter } = parseResult.data;
      const normalizedEmail = email.toLowerCase().trim();

      // 3. Chỉ chấp nhận CV upload thực tế, không cho giả mạo đường dẫn cvUrl.
      const file = req.file;
      let finalCvUrl: string | null = null;

      if (!file) {
        errorResponse(
          res,
          'Vui lòng đính kèm tệp CV định dạng PDF hoặc DOCX, dung lượng tối đa 10 MB.',
          400,
          'MISSING_CV'
        );
        return;
      }

      // If a file was uploaded in this request, validate content and save securely to disk
      if (file) {
        // Deep content verification via magic bytes
        const magicCheck = validateCvMagicBytes(file.buffer, file.originalname);
        if (!magicCheck.valid) {
          errorResponse(res, magicCheck.error || 'Tệp CV không hợp lệ.', 415, 'INVALID_CV_SIGNATURE');
          return;
        }

        // Ensure target upload directory exists
        if (!fs.existsSync(UPLOAD_DIR)) {
          fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }

        // Generate collision-resistant sanitized filename
        const ext = path.extname(file.originalname).toLowerCase();
        const safeFilename = `cv_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
        const targetPath = path.join(UPLOAD_DIR, safeFilename);

        // Prevent path traversal
        if (!targetPath.startsWith(UPLOAD_DIR)) {
          errorResponse(res, 'Tên tệp không hợp lệ.', 400, 'INVALID_FILENAME');
          return;
        }

        fs.writeFileSync(targetPath, file.buffer);
        savedFilePath = targetPath;
        finalCvUrl = `/uploads/cvs/${safeFilename}`;
      }

      // 4. Check Job eligibility: must be PUBLISHED, approved, published, and not expired
      const job = await prisma.job.findFirst({
        where: {
          id: targetJobId,
          status: 'PUBLISHED',
          approvedAt: { not: null },
          publishedAt: { not: null },
          OR: [
            { applicationDeadline: null },
            { applicationDeadline: { gte: new Date() } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          recruiterId: true,
          department: { select: { name: true } },
        },
      });

      if (!job) {
        // Remove uploaded file if job is not accepting applications
        if (savedFilePath && fs.existsSync(savedFilePath)) {
          fs.unlinkSync(savedFilePath);
          savedFilePath = null;
        }
        errorResponse(
          res,
          'Vui lòng kiểm tra lại: Vị trí tuyển dụng không tồn tại, đã đóng hoặc chưa được công khai nhận hồ sơ.',
          404,
          'JOB_NOT_FOUND'
        );
        return;
      }

      // 5. Duplicate Submission Check: reject if same email already applied to this job
      // Kể cả email cũ từng lưu hoa/thường, vẫn chặn trùng theo email chuẩn hóa.
      const alreadyApplied = await prisma.application.findMany({
        where: { jobId: job.id },
        select: { applicantEmailNormalized: true, candidate: { select: { email: true } } },
      });
      if (alreadyApplied.some((a) => (a.applicantEmailNormalized || a.candidate.email).trim().toLowerCase() === normalizedEmail)) {
          if (savedFilePath && fs.existsSync(savedFilePath)) {
            fs.unlinkSync(savedFilePath);
            savedFilePath = null;
          }
          errorResponse(
            res,
            'Bạn đã nộp hồ sơ cho vị trí tuyển dụng này trước đó. Hệ thống không cho phép nộp trùng lặp.',
            409,
            'DUPLICATE_APPLICATION'
          );
          return;
      }

      // 6. Generate Unique Tracking Code with collision protection
      let trackingCode = generateTrackingCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const codeExists = await prisma.application.findUnique({
          where: { trackingCode },
          select: { id: true },
        });
        if (!codeExists) break;
        trackingCode = generateTrackingCode();
      }

      // 7. Atomic Database Transaction: Upsert Candidate + Create Application + AuditLog
      const clientIp = getClientIp(req);
      const result = await prisma.$transaction(async (tx) => {
        // Upsert Candidate profile
        let candidate = await tx.candidate.findFirst({
          where: { email: normalizedEmail },
        });

        if (candidate) {
          candidate = await tx.candidate.update({
            where: { id: candidate.id },
            data: {
              fullName,
              phone: phone || candidate.phone,
              cvUrl: finalCvUrl || candidate.cvUrl,
            },
          });
        } else {
          candidate = await tx.candidate.create({
            data: {
              fullName,
              email: normalizedEmail,
              phone: phone || null,
              cvUrl: finalCvUrl,
            },
          });
        }

        // Create Application record with unique tracking code
        const application = await tx.application.create({
          data: {
            candidateId: candidate.id,
            jobId: job.id,
            stage: 'APPLIED',
            status: 'ACTIVE',
            assignedRecruiterId: job.recruiterId || null,
            trackingCode,
            applicantEmailNormalized: normalizedEmail,
            coverLetter: coverLetter || null,
            source: source || null,
            cvUrl: finalCvUrl,
          },
        });

        // Record AuditLog
        await tx.auditLog.create({
          data: {
            action: 'PUBLIC_APPLICATION_SUBMITTED',
            resourceType: 'application',
            resourceId: application.id,
            ipAddress: clientIp,
            metadata: JSON.stringify({
              jobId: job.id,
              jobTitle: job.title,
              candidateId: candidate.id,
              trackingCode,
            }),
          },
        });

        return { candidate, application };
      });

      // 8. Giới hạn tốc độ được ghi nhận trước khi kiểm tra và tiếp nhận tệp.

      // 9. Send Confirmation Email (safe async execution; does not fail application on SMTP error)
      const emailResult = await sendApplicationConfirmationEmail({
        toEmail: normalizedEmail,
        fullName: result.candidate.fullName,
        jobTitle: job.title,
        trackingCode: result.application.trackingCode!,
      });

      // 10. Return HTTP 201 Created with tracking code and safe public data
      successResponse(
        res,
        {
          trackingCode: result.application.trackingCode,
          fullName: result.candidate.fullName,
          jobTitle: job.title,
          appliedAt: result.application.createdAt,
          emailSent: emailResult.success,
        },
        201,
        'Nộp hồ sơ ứng tuyển thành công. Vui lòng lưu lại mã tra cứu để theo dõi trạng thái hồ sơ.'
      );
    } catch (err: unknown) {
      // Safe cleanup of uploaded file if an unhandled exception occurred
      if (savedFilePath && fs.existsSync(savedFilePath)) {
        try {
          fs.unlinkSync(savedFilePath);
        } catch {
          // ignore cleanup errors
        }
      }

      // CSDL cưỡng chế duy nhất (jobId, applicantEmailNormalized) khi có nhiều yêu cầu đồng thời.
      if ((err as { code?: string })?.code === 'P2002') {
        errorResponse(res, 'Bạn đã nộp hồ sơ cho vị trí này bằng email trên. Không thể nộp trùng.', 409, 'DUPLICATE_APPLICATION');
        return;
      }

      console.error('[Public Application Error]:', err);
      errorResponse(res, 'Đã xảy ra lỗi khi tiếp nhận hồ sơ. Vui lòng thử lại sau.', 500, 'APPLICATION_SUBMISSION_FAILED');
    }
  }
}
