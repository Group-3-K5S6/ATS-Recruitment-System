import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { recordRequestAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';
import { errorResponse, successResponse } from '../../utils/response';

export const createJobPostingDraftSchema = z.object({
  requisitionId: z.string().uuid({ message: 'requisitionId phải là UUID hợp lệ.' }),
  title: z
    .string()
    .trim()
    .min(3, { message: 'Tiêu đề cần ít nhất 3 ký tự.' })
    .max(200, { message: 'Tiêu đề không quá 200 ký tự.' }),
  description: z
    .string()
    .trim()
    .min(10, { message: 'Mô tả công việc cần ít nhất 10 ký tự.' }),
  location: z
    .string()
    .trim()
    .min(1, { message: 'Địa điểm không được để trống.' })
    .max(200, { message: 'Địa điểm không quá 200 ký tự.' }),
  workMode: z.enum(['ONSITE', 'HYBRID', 'REMOTE'], {
    errorMap: () => ({ message: 'Hình thức làm việc phải là ONSITE, HYBRID hoặc REMOTE.' }),
  }),
  applicationDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Hạn nhận hồ sơ phải có định dạng YYYY-MM-DD.' }),
  showSalary: z.boolean().optional().default(false),
});

export type CreateJobPostingDraftInput = z.infer<typeof createJobPostingDraftSchema>;

export class JobPostingDraftController {
  static async createDraft(req: Request, res: Response): Promise<void> {
    const user = req.user!;
    const data = req.body as CreateJobPostingDraftInput;

    // Kiểm tra tính hợp lệ của hạn nhận hồ sơ (không ở quá khứ)
    const deadlineDate = new Date(`${data.applicationDeadline}T00:00:00.000Z`);
    if (isNaN(deadlineDate.getTime())) {
      errorResponse(res, 'Hạn nhận hồ sơ không hợp lệ.', 400, 'VALIDATION_ERROR');
      return;
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (data.applicationDeadline < todayStr) {
      errorResponse(res, 'Hạn nhận hồ sơ không được ở quá khứ.', 400, 'VALIDATION_ERROR');
      return;
    }

    // 1. Tìm Requisition theo requisitionId
    const requisition = await prisma.requisition.findUnique({
      where: { id: data.requisitionId },
    });

    // 2. Không tồn tại -> 404 NOT_FOUND
    if (!requisition) {
      errorResponse(res, 'Không tìm thấy yêu cầu tuyển dụng.', 404, 'NOT_FOUND');
      return;
    }

    // 3. Chỉ cho phép tạo tin từ yêu cầu ở trạng thái Đã duyệt (APPROVED)
    if (requisition.status !== 'APPROVED') {
      errorResponse(
        res,
        'Chỉ yêu cầu tuyển dụng ở trạng thái Đã duyệt mới được dùng để soạn tin tuyển dụng.',
        400,
        'INVALID_STATUS'
      );
      return;
    }

    try {
      // 4 & 5 & 6 & 7. Tạo bản ghi Job với status = 'DRAFT', kế thừa metadata từ Requisition
      const job = await prisma.job.create({
        data: {
          title: data.title.trim(),
          description: data.description.trim(),
          location: data.location.trim(),
          workMode: data.workMode,
          applicationDeadline: deadlineDate,
          showSalary: data.showSalary ?? false,
          status: 'DRAFT',
          requisitionId: requisition.id,
          departmentId: requisition.departmentId,
          hiringManagerId: requisition.hiringManagerId,
          jobTitleId: requisition.jobTitleId,
          recruiterId: user.id,
        },
      });

      // 8. Ghi AuditLog với action CREATE_JOB_POSTING_DRAFT
      try {
        await recordRequestAudit(
          req,
          AuditAction.CREATE_JOB_POSTING_DRAFT,
          'job',
          job.id,
          {
            requisitionId: requisition.id,
            title: job.title,
            workMode: job.workMode,
            applicationDeadline: data.applicationDeadline,
            showSalary: job.showSalary,
          }
        );
      } catch (auditError) {
        console.error('Không thể ghi nhận nhật ký kiểm toán cho bản nháp tin tuyển dụng:', auditError);
      }

      // 9. Trả HTTP 201 Created
      successResponse(res, job, 201, 'Đã lưu bản nháp tin tuyển dụng.');
    } catch (dbError) {
      console.error('Lỗi khi lưu bản nháp tin tuyển dụng vào cơ sở dữ liệu:', dbError);
      errorResponse(res, 'Không thể lưu bản nháp tin tuyển dụng do lỗi hệ thống.', 500, 'INTERNAL_SERVER_ERROR');
    }
  }
}
