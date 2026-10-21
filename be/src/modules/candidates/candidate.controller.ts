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

    const candidate = await CandidateService.findCandidateForUser(id, user);
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
}
