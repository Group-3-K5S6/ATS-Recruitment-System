import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { CandidateService } from './candidate.service';
import { CandidatePolicy } from '../../policies/candidate.policy';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { CvParserService } from './cv-parser.service';
import { readFile, realpath } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';

export const createCandidateSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  cvUrl: z.string().url().optional(),
  address: z.string().optional(),
  expectedSalary: z.number().positive().optional(),
  currentCompany: z.string().optional(),
  jobId: z.string().optional(),
});

export const updateCandidateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  cvUrl: z.string().url().optional(),
  address: z.string().optional(),
  expectedSalary: z.number().positive().optional(),
  currentCompany: z.string().optional(),
});

export class CandidateController {
  static async list(req: Request, res: Response): Promise<void> {
    const candidates = await CandidateService.listCandidatesForUser(req.user!);
    successResponse(res, candidates, 200);
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    // Scoped query filter directly at database layer to prevent IDOR
    const candidate = await CandidateService.findCandidateForUser(id, req.user!);

    if (!candidate) {
      // Check if candidate actually exists to differentiate 403 vs 404 securely
      const exists = await prisma.candidate.findUnique({ where: { id } });
      if (exists) {
        errorResponse(
          res,
          'Access denied. You do not have permission to access this candidate profile.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Candidate not found.', 404, 'NOT_FOUND');
      return;
    }

    await recordRequestAudit(req, AuditAction.CANDIDATE_VIEWED, 'candidate', candidate.id);

    successResponse(res, candidate, 200);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const data = req.body;
    const user = req.user!;

    // Prevent client identity spoofing: if user is CANDIDATE, force userId = user.id
    const targetUserId = user.roles.includes(RoleType.CANDIDATE) ? user.id : undefined;

    if (targetUserId) {
      const existing = await prisma.candidate.findUnique({ where: { userId: targetUserId } });
      if (existing) {
        const updated = await prisma.candidate.update({
          where: { id: existing.id },
          data: {
            fullName: data.fullName || existing.fullName,
            phone: data.phone ?? existing.phone,
            cvUrl: data.cvUrl ?? existing.cvUrl,
            address: data.address ?? existing.address,
            expectedSalary: data.expectedSalary ?? existing.expectedSalary,
            currentCompany: data.currentCompany ?? existing.currentCompany,
          },
        });
        await recordRequestAudit(req, AuditAction.CANDIDATE_UPDATED, 'candidate', updated.id);
        successResponse(res, CandidatePolicy.sanitize(user, updated), 200, 'Candidate profile updated');
        return;
      }
    }

    const candidate = await prisma.candidate.create({
      data: {
        fullName: data.fullName,
        email: user.roles.includes(RoleType.CANDIDATE) ? user.email : data.email,
        phone: data.phone,
        cvUrl: data.cvUrl,
        address: data.address,
        expectedSalary: data.expectedSalary,
        currentCompany: data.currentCompany,
        userId: targetUserId,
        applications: data.jobId
          ? {
              create: {
                jobId: data.jobId,
                stage: 'APPLIED',
                status: 'ACTIVE',
              },
            }
          : undefined,
      },
    });

    await recordRequestAudit(req, AuditAction.CANDIDATE_CREATED, 'candidate', candidate.id);

    successResponse(res, CandidatePolicy.sanitize(user, candidate), 201, 'Candidate created successfully');
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canUpdate = await CandidatePolicy.canUpdate(user, id);
    if (!canUpdate) {
      errorResponse(
        res,
        'Access denied. You cannot modify this candidate profile.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    const updated = await prisma.candidate.update({
      where: { id },
      data: req.body,
    });

    await recordRequestAudit(req, AuditAction.CANDIDATE_UPDATED, 'candidate', updated.id);

    successResponse(res, CandidatePolicy.sanitize(user, updated), 200, 'Candidate updated successfully');
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const canDelete = await CandidatePolicy.canDelete(user, id);
    if (!canDelete) {
      errorResponse(res, 'Access denied. You cannot delete candidate records.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    await prisma.candidate.delete({ where: { id } });

    await recordRequestAudit(req, AuditAction.CANDIDATE_DELETED, 'candidate', id);

    successResponse(res, { message: 'Candidate deleted successfully' }, 200);
  }

  /**
   * Endpoint to securely download/view candidate CV with full server-side authorization check
   */
  static async getCv(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    // S4-09: CV metadata must use the SAME scope as the unified profile.
    const candidate = await CandidateService.getUnifiedProfile(id, user);
    if (!candidate) {
      errorResponse(
        res,
        'Access denied. You do not have permission to view or download this candidate CV.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    if (!candidate.cvUrl) {
      errorResponse(res, 'Candidate does not have a CV uploaded.', 404, 'CV_NOT_FOUND');
      return;
    }

    await recordRequestAudit(req, AuditAction.CANDIDATE_VIEWED, 'candidate', candidate.id, {
      actionType: 'CV_DOWNLOAD',
    });

    successResponse(res, { cvUrl: candidate.cvUrl }, 200);
  }

  /** S409_REAL_LOCAL_CV_STORAGE: read existing S4-03 upload after S4-09 access check. */
  static async previewLocalTestCv(req: Request, res: Response): Promise<void> {
    const profile = await CandidateService.getUnifiedProfile(req.params.id, req.user!);
    if (!profile) {
      errorResponse(res, 'Access denied.', 403, 'FORBIDDEN_SCOPE');
      return;
    }
    const cvUrl = profile.cvUrl ?? '';
    // Only local files named by the existing S4-03 upload path are accepted.
    const local = /^\/uploads\/cvs\/(cv_[0-9]+_[0-9a-f]{16}\.(pdf|docx))$/.exec(cvUrl);
    const demo = /^s409-demo:\/\/([A-Za-z0-9_-]+\.pdf)$/.exec(cvUrl);
    const name = local?.[1] ?? demo?.[1];
    if (!name || (!local && (process.env.NODE_ENV === 'production' || !process.env.S409_CV_TEST_DIR))) {
      errorResponse(res, 'CV preview unavailable.', 404, 'CV_NOT_FOUND');
      return;
    }
    try {
      if (basename(name) !== name) throw new Error('INVALID_CV_NAME');
      const folder = local
        ? join(process.cwd(), 'uploads', 'cvs')
        : process.env.S409_CV_TEST_DIR!;
      const base = await realpath(folder);
      const file = await realpath(join(base, name));
      if (!file.startsWith(base + sep)) throw new Error('INVALID_CV_PATH');
      const cv = await readFile(file);
      if (cv.length < 8 || cv.length > 10 * 1024 * 1024) throw new Error('INVALID_CV_SIZE');
      const pdf = !local || local[2] === 'pdf';
      if (pdf && cv.subarray(0,5).toString() !== '%PDF-') throw new Error('INVALID_PDF');
      if (!pdf && (cv.subarray(0,4).toString('hex') !== '504b0304' ||
          (!cv.includes(Buffer.from('word/')) && !cv.includes(Buffer.from('[Content_Types].xml'))))) {
        throw new Error('INVALID_DOCX');
      }
      await recordRequestAudit(req, AuditAction.CANDIDATE_VIEWED, 'candidate', profile.id, {
        actionType: local ? 'CV_PREVIEW_LOCAL' : 'CV_PREVIEW_TEST',
      });
      res.status(200).set({
        'Content-Type': pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': pdf ? 'inline; filename="candidate-cv.pdf"' : 'attachment; filename="candidate-cv.docx"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      }).send(cv);
    } catch {
      errorResponse(res, 'CV preview unavailable.', 404, 'CV_NOT_FOUND');
    }
  }

  /**
   * S4-04: Bóc tách thông tin ứng viên (họ tên, email, số điện thoại) từ CV dạng PDF
   * - Phục vụ Recruiter xem trước, xác nhận hoặc sửa
   * - Tuyệt đối không tự động ghi đè hoặc tự động lưu vào DB
   * - Bóc tách thất bại không làm hỏng việc nộp hồ sơ
   */
  static async parseCv(req: Request, res: Response): Promise<void> {
    let fileBuffer: Buffer | null = null;
    let filename = '';

    if (req.file) {
      fileBuffer = req.file.buffer;
      filename = req.file.originalname;
    } else if (req.body?.cvBase64) {
      try {
        const base64Data = String(req.body.cvBase64).replace(/^data:application\/pdf;base64,/, '');
        fileBuffer = Buffer.from(base64Data, 'base64');
        filename = req.body.filename || 'cv.pdf';
      } catch {
        errorResponse(res, 'Dữ liệu base64 của CV không hợp lệ.', 400, 'INVALID_BASE64');
        return;
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      errorResponse(res, 'Vui lòng cung cấp tệp CV định dạng PDF để bóc tách.', 400, 'CV_FILE_REQUIRED');
      return;
    }

    try {
      const extracted = await CvParserService.parseCv(fileBuffer, filename);
      successResponse(res, extracted, 200, extracted.message);
    } catch (err: any) {
      if (err.message === 'INVALID_PDF_FORMAT') {
        errorResponse(res, 'Hệ thống chỉ hỗ trợ bóc tách CV định dạng PDF.', 400, 'INVALID_PDF_FORMAT');
        return;
      }
      // Bóc tách thất bại không làm hỏng luồng: trả về form trắng để Recruiter nhập thủ công
      successResponse(
        res,
        {
          fullName: '',
          email: '',
          phone: '',
          rawText: '',
          isParsed: false,
          message: 'Không thể bóc tách nội dung từ tệp PDF này. Bạn có thể nhập thông tin ứng viên thủ công để tiếp tục.',
          fieldsExtracted: { fullName: false, email: false, phone: false },
        },
        200
      );
    }
  }

  /** S4-09: danh sách hồ sơ hợp nhất theo đúng vị trí được phân quyền. */
  static async listUnifiedProfiles(req: Request, res: Response): Promise<void> {
    const candidates = await CandidateService.listUnifiedProfiles(req.user!);
    if (candidates === null) {
      errorResponse(res, 'Access denied.', 403, 'FORBIDDEN_ROLE');
      return;
    }
    successResponse(res, candidates, 200);
  }

  /**
   * GET /api/candidates/:id/profile
   * Unified candidate profile: personal info + full application history
   * (job details, interview schedule, evaluations, offers) scoped by role.
   */
  static async getUnifiedProfile(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const user = req.user!;

    const profile = await CandidateService.getUnifiedProfile(id, user);

    if (!profile) {
      // Differentiate 403 vs 404 without leaking existence to unauthorised users
      const exists = await prisma.candidate.findUnique({ where: { id }, select: { id: true } });
      if (exists) {
        errorResponse(
          res,
          'Access denied. You do not have permission to access this candidate profile.',
          403,
          'FORBIDDEN_SCOPE'
        );
        return;
      }
      errorResponse(res, 'Candidate not found.', 404, 'NOT_FOUND');
      return;
    }

    await recordRequestAudit(req, AuditAction.CANDIDATE_VIEWED, 'candidate', profile.id, {
      actionType: 'UNIFIED_PROFILE_VIEW',
    });

    successResponse(res, profile, 200);
  }
}
