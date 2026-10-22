import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { successResponse, errorResponse } from '../../utils/response';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';

export const createReferralSchema = z.object({
  jobId: z.string().trim().min(1, 'Mã vị trí tuyển dụng là bắt buộc'),
  fullName: z.string().trim().min(2, 'Họ và tên ứng viên phải có ít nhất 2 ký tự'),
  email: z.string().trim().email('Địa chỉ email không đúng định dạng'),
  phone: z.string().trim().optional(),
  cvUrl: z.string().trim().url('Đường dẫn CV phải là URL hợp lệ').optional().or(z.literal('')),
  notes: z.string().trim().max(2000, 'Ghi chú không được vượt quá 2000 ký tự').optional(),
  address: z.string().trim().optional(),
  currentCompany: z.string().trim().optional(),
});

export type GeneralReferralStatus = 'RECEIVED' | 'UNDER_REVIEW' | 'INTERVIEW' | 'COMPLETED';

/**
 * Ánh xạ trạng thái tuyển dụng chi tiết thành trạng thái tổng quát
 * Bảo đảm không để lộ ghi chú nội bộ hay chi tiết đánh giá
 */
export function mapToGeneralStatus(
  stage?: string | null,
  status?: string | null
): { generalStatus: GeneralReferralStatus; statusLabel: string } {
  const normalizedStage = (stage || 'APPLIED').toUpperCase();
  const normalizedStatus = (status || 'ACTIVE').toUpperCase();

  // Hồ sơ đã kết thúc (từ chối hoặc đã tuyển)
  if (normalizedStatus === 'REJECTED' || normalizedStage === 'REJECTED') {
    return { generalStatus: 'COMPLETED', statusLabel: 'Không phù hợp' };
  }
  if (normalizedStatus === 'HIRED' || normalizedStage === 'HIRED' || normalizedStage === 'ACCEPTED') {
    return { generalStatus: 'COMPLETED', statusLabel: 'Đã tuyển dụng' };
  }
  if (normalizedStatus === 'ARCHIVED' || normalizedStatus === 'CANCELLED' || normalizedStage === 'CANCELLED') {
    return { generalStatus: 'COMPLETED', statusLabel: 'Đã kết thúc' };
  }

  // Các giai đoạn đang hoạt động
  switch (normalizedStage) {
    case 'APPLIED':
    case 'NEW':
      return { generalStatus: 'RECEIVED', statusLabel: 'Đã nhận hồ sơ' };
    case 'SCREENING':
    case 'REVIEW':
    case 'SHORTLIST':
    case 'SHORTLISTED':
      return { generalStatus: 'UNDER_REVIEW', statusLabel: 'Đang xem xét' };
    case 'INTERVIEW':
    case 'INTERVIEWING':
    case 'ASSESSMENT':
      return { generalStatus: 'INTERVIEW', statusLabel: 'Mời phỏng vấn' };
    case 'OFFER':
    case 'OFFERED':
      return { generalStatus: 'UNDER_REVIEW', statusLabel: 'Đang xem xét' };
    default:
      return { generalStatus: 'UNDER_REVIEW', statusLabel: 'Đang xử lý' };
  }
}

export class ReferralController {
  /**
   * POST /api/referrals
   * Nhân viên nội bộ gửi hồ sơ giới thiệu ứng viên
   */
  static async create(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const data = req.body;

    // 1. Kiểm tra quyền nhân viên nội bộ: CANDIDATE không được phép giới thiệu nội bộ
    if (user.roles.length === 1 && user.roles.includes(RoleType.CANDIDATE)) {
      errorResponse(
        res,
        'Chỉ nhân viên nội bộ mới có quyền giới thiệu ứng viên.',
        403,
        'FORBIDDEN_ROLE'
      );
      return;
    }

    // 2. Định danh người giới thiệu từ tài khoản đăng nhập (chống mạo danh)
    const referrerId = user.id;

    // 3. Kiểm tra vị trí tuyển dụng hợp lệ
    const job = await prisma.job.findUnique({
      where: { id: data.jobId },
      include: {
        department: true,
      },
    });

    if (!job) {
      errorResponse(res, 'Vị trí tuyển dụng không tồn tại.', 404, 'NOT_FOUND');
      return;
    }

    // Vị trí phải ở trạng thái PUBLISHED để nhận hồ sơ
    if (job.status !== 'PUBLISHED') {
      errorResponse(
        res,
        'Vị trí tuyển dụng hiện không mở nhận hồ sơ.',
        400,
        'JOB_NOT_OPEN'
      );
      return;
    }

    // Kiểm tra hạn nộp hồ sơ
    if (job.applicationDeadline && new Date(job.applicationDeadline).getTime() < Date.now()) {
      errorResponse(
        res,
        'Vị trí tuyển dụng đã hết hạn nhận hồ sơ.',
        400,
        'JOB_DEADLINE_EXPIRED'
      );
      return;
    }

    const candidateEmail = data.email.toLowerCase();

    // 4. Kiểm tra hồ sơ trùng lặp: cùng email nộp/giới thiệu cho cùng một jobId
    let candidate = await prisma.candidate.findFirst({
      where: { email: candidateEmail },
    });

    if (candidate) {
      const existingApplication = await prisma.application.findFirst({
        where: {
          candidateId: candidate.id,
          jobId: job.id,
        },
      });

      if (existingApplication) {
        errorResponse(
          res,
          'Ứng viên này đã nộp hồ sơ hoặc đã được giới thiệu cho vị trí tuyển dụng này.',
          409,
          'DUPLICATE_APPLICATION'
        );
        return;
      }
    }

    // 5. Tạo hoặc cập nhật thông tin ứng viên
    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          fullName: data.fullName,
          email: candidateEmail,
          phone: data.phone || null,
          cvUrl: data.cvUrl || null,
          address: data.address || null,
          currentCompany: data.currentCompany || null,
        },
      });
    } else {
      // Cập nhật thông tin bổ sung nếu có
      candidate = await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          phone: data.phone || candidate.phone,
          cvUrl: data.cvUrl || candidate.cvUrl,
          currentCompany: data.currentCompany || candidate.currentCompany,
          address: data.address || candidate.address,
        },
      });
    }

    // 6. Tạo Application gắn với vị trí
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId: job.id,
        stage: 'APPLIED',
        status: 'ACTIVE',
      },
    });

    // 7. Tạo bản ghi Referral liên kết người giới thiệu, ứng viên, hồ sơ và vị trí
    const referral = await prisma.referral.create({
      data: {
        referrerId,
        candidateId: candidate.id,
        applicationId: application.id,
        jobId: job.id,
        notes: data.notes || null,
        source: 'INTERNAL_REFERRAL',
      },
      include: {
        job: {
          select: { id: true, title: true, department: { select: { id: true, name: true } } },
        },
        candidate: {
          select: { id: true, fullName: true, email: true, phone: true, cvUrl: true },
        },
        application: {
          select: { id: true, stage: true, status: true, createdAt: true },
        },
        referrer: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    // 8. Ghi nhật ký kiểm toán (Audit Log)
    await recordRequestAudit(req, AuditAction.REFERRAL_CREATED, 'referral', referral.id, {
      jobId: job.id,
      candidateId: candidate.id,
      applicationId: application.id,
      source: 'INTERNAL_REFERRAL',
    });

    const { generalStatus, statusLabel } = mapToGeneralStatus(
      referral.application.stage,
      referral.application.status
    );

    successResponse(
      res,
      {
        id: referral.id,
        jobId: referral.jobId,
        jobTitle: referral.job.title,
        departmentName: referral.job.department?.name || null,
        candidate: {
          id: referral.candidate.id,
          fullName: referral.candidate.fullName,
          email: referral.candidate.email,
          phone: referral.candidate.phone,
          cvUrl: referral.candidate.cvUrl,
        },
        referrer: {
          id: referral.referrer.id,
          fullName: referral.referrer.fullName,
          email: referral.referrer.email,
        },
        notes: referral.notes,
        source: referral.source,
        generalStatus,
        statusLabel,
        createdAt: referral.createdAt,
      },
      201,
      'Giới thiệu ứng viên thành công.'
    );
  }

  /**
   * GET /api/referrals/my-referrals
   * Người giới thiệu xem danh sách hồ sơ mình đã giới thiệu (bảo mật & phân trang)
   */
  static async getMyReferrals(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    if (user.roles.length === 1 && user.roles.includes(RoleType.CANDIDATE)) {
      errorResponse(
        res,
        'Chỉ nhân viên nội bộ mới có quyền truy cập danh sách giới thiệu.',
        403,
        'FORBIDDEN_ROLE'
      );
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    // Scoped strictly to current authenticated user's ID
    const where = { referrerId: user.id };

    const [items, total] = await Promise.all([
      prisma.referral.findMany({
        where,
        include: {
          job: {
            select: { id: true, title: true, department: { select: { id: true, name: true } } },
          },
          candidate: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
          application: {
            select: { id: true, stage: true, status: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.referral.count({ where }),
    ]);

    // Format & sanitize data: KHÔNG để lộ ghi chú nội bộ tuyển dụng hay thông tin nhạy cảm
    const sanitizedItems = items.map((ref) => {
      const { generalStatus, statusLabel } = mapToGeneralStatus(
        ref.application?.stage,
        ref.application?.status
      );

      return {
        id: ref.id,
        candidateName: ref.candidate.fullName,
        candidateEmail: ref.candidate.email,
        candidatePhone: ref.candidate.phone,
        jobId: ref.jobId,
        jobTitle: ref.job.title,
        departmentName: ref.job.department?.name || null,
        referralDate: ref.createdAt,
        notes: ref.notes,
        source: ref.source,
        generalStatus,
        statusLabel,
      };
    });

    successResponse(
      res,
      {
        items: sanitizedItems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
      200
    );
  }

  /**
   * GET /api/referrals/my-referrals/:id
   * Xem chi tiết một hồ sơ do mình giới thiệu
   */
  static async getMyReferralDetail(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const { id } = req.params;

    const referral = await prisma.referral.findUnique({
      where: { id },
      include: {
        job: {
          select: { id: true, title: true, department: { select: { id: true, name: true } } },
        },
        candidate: {
          select: { id: true, fullName: true, email: true, phone: true, cvUrl: true },
        },
        application: {
          select: { id: true, stage: true, status: true, createdAt: true },
        },
      },
    });

    if (!referral) {
      errorResponse(res, 'Hồ sơ giới thiệu không tồn tại.', 404, 'NOT_FOUND');
      return;
    }

    // Scoped check: chỉ người giới thiệu hoặc Admin mới có quyền xem
    if (referral.referrerId !== user.id && !user.roles.includes(RoleType.ADMIN)) {
      errorResponse(
        res,
        'Bạn không có quyền truy cập hồ sơ giới thiệu này.',
        403,
        'FORBIDDEN_SCOPE'
      );
      return;
    }

    await recordRequestAudit(req, AuditAction.REFERRAL_VIEWED, 'referral', referral.id);

    const { generalStatus, statusLabel } = mapToGeneralStatus(
      referral.application?.stage,
      referral.application?.status
    );

    successResponse(
      res,
      {
        id: referral.id,
        candidateName: referral.candidate.fullName,
        candidateEmail: referral.candidate.email,
        candidatePhone: referral.candidate.phone,
        cvUrl: referral.candidate.cvUrl,
        jobId: referral.jobId,
        jobTitle: referral.job.title,
        departmentName: referral.job.department?.name || null,
        referralDate: referral.createdAt,
        notes: referral.notes,
        source: referral.source,
        generalStatus,
        statusLabel,
      },
      200
    );
  }

  /**
   * GET /api/referrals
   * Bộ phận nhân sự / tuyển dụng xem danh sách tất cả giới thiệu
   */
  static async listAll(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    // Chỉ ADMIN, HR_MANAGER, RECRUITER mới có quyền xem toàn bộ danh sách
    const isHrOrAdmin =
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER);

    if (!isHrOrAdmin) {
      errorResponse(
        res,
        'Bạn không có quyền truy cập danh sách quản lý giới thiệu toàn hệ thống.',
        403,
        'FORBIDDEN_ROLE'
      );
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const jobId = req.query.jobId as string | undefined;
    const referrerId = req.query.referrerId as string | undefined;

    const where: any = {};
    if (jobId) where.jobId = jobId;
    if (referrerId) where.referrerId = referrerId;

    const [items, total] = await Promise.all([
      prisma.referral.findMany({
        where,
        include: {
          job: {
            select: { id: true, title: true, department: { select: { id: true, name: true } } },
          },
          candidate: {
            select: { id: true, fullName: true, email: true, phone: true, cvUrl: true },
          },
          referrer: {
            select: { id: true, fullName: true, email: true, departmentId: true },
          },
          application: {
            select: { id: true, stage: true, status: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.referral.count({ where }),
    ]);

    const formattedItems = items.map((ref) => {
      const { generalStatus, statusLabel } = mapToGeneralStatus(
        ref.application?.stage,
        ref.application?.status
      );

      return {
        id: ref.id,
        candidate: {
          id: ref.candidate.id,
          fullName: ref.candidate.fullName,
          email: ref.candidate.email,
          phone: ref.candidate.phone,
          cvUrl: ref.candidate.cvUrl,
        },
        referrer: {
          id: ref.referrer.id,
          fullName: ref.referrer.fullName,
          email: ref.referrer.email,
        },
        job: {
          id: ref.job.id,
          title: ref.job.title,
          departmentName: ref.job.department?.name || null,
        },
        applicationId: ref.applicationId,
        applicationStage: ref.application?.stage || 'APPLIED',
        applicationStatus: ref.application?.status || 'ACTIVE',
        generalStatus,
        statusLabel,
        notes: ref.notes,
        source: ref.source,
        createdAt: ref.createdAt,
      };
    });

    successResponse(
      res,
      {
        items: formattedItems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
      200
    );
  }
}
