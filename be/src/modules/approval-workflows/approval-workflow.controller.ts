import { Request, Response } from 'express';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalWorkflowError } from './approval-workflow.types';
import { successResponse, errorResponse } from '../../utils/response';

export class ApprovalWorkflowController {
  static async list(_req: Request, res: Response): Promise<void> {
    try {
      const workflows = await ApprovalWorkflowService.listWorkflows();
      successResponse(res, workflows, 200);
    } catch (error) {
      if (error instanceof ApprovalWorkflowError) {
        errorResponse(res, error.message, error.statusCode, error.code);
        return;
      }
      errorResponse(res, 'Không thể tải danh sách luồng phê duyệt.', 500, 'SERVER_ERROR');
    }
  }

  static async getByDepartment(req: Request, res: Response): Promise<void> {
    try {
      const { departmentId } = req.params;
      const workflow = await ApprovalWorkflowService.getWorkflowByDepartment(departmentId);
      if (!workflow) {
        errorResponse(res, 'Phòng ban chưa có cấu hình luồng phê duyệt.', 404, 'WORKFLOW_NOT_FOUND');
        return;
      }
      successResponse(res, workflow, 200);
    } catch (error) {
      if (error instanceof ApprovalWorkflowError) {
        errorResponse(res, error.message, error.statusCode, error.code);
        return;
      }
      errorResponse(res, 'Không thể lấy cấu hình luồng phê duyệt.', 500, 'SERVER_ERROR');
    }
  }

  static async save(req: Request, res: Response): Promise<void> {
    try {
      const saved = await ApprovalWorkflowService.saveWorkflow(req.body);

      successResponse(
        res,
        saved,
        201,
        `Đã lưu cấu hình luồng phê duyệt phiên bản ${saved.version}.`
      );
    } catch (error) {
      if (error instanceof ApprovalWorkflowError) {
        errorResponse(res, error.message, error.statusCode, error.code);
        return;
      }
      const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi lưu luồng phê duyệt.';
      errorResponse(res, message, 500, 'SERVER_ERROR');
    }
  }
}
