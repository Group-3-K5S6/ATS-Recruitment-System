import { prisma } from '../../database/prisma';
import { Prisma } from '@prisma/client';
import {
  ApprovalStepSnapshot,
  ApprovalWorkflowError,
  SavedWorkflow,
  SavedWorkflowRange,
  SaveWorkflowInput,
} from './approval-workflow.types';
import { RoleType } from '../../rbac/roles';

export class ApprovalWorkflowService {
  /**
   * Lấy danh sách luồng phê duyệt đang áp dụng (active) theo từng phòng ban
   */
  static async listWorkflows(): Promise<SavedWorkflow[]> {
    const workflows = await prisma.approvalWorkflow.findMany({
      where: { isActive: true },
      include: {
        ranges: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return workflows.map((wf) => ({
      id: wf.id,
      departmentId: wf.departmentId,
      version: wf.version,
      ranges: wf.ranges.map((r) => ({
        minSalary: r.minSalary,
        maxSalary: r.maxSalary,
        approverIds: JSON.parse(r.approverIds) as string[],
      })),
      isActive: wf.isActive,
      createdAt: wf.createdAt.toISOString(),
      updatedAt: wf.updatedAt.toISOString(),
    }));
  }

  /**
   * Lấy cấu hình luồng duyệt đang áp dụng của một phòng ban cụ thể
   */
  static async getWorkflowByDepartment(departmentId: string): Promise<SavedWorkflow | null> {
    const wf = await prisma.approvalWorkflow.findFirst({
      where: { departmentId, isActive: true },
      include: {
        ranges: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { version: 'desc' },
    });

    if (!wf) return null;

    return {
      id: wf.id,
      departmentId: wf.departmentId,
      version: wf.version,
      ranges: wf.ranges.map((r) => ({
        minSalary: r.minSalary,
        maxSalary: r.maxSalary,
        approverIds: JSON.parse(r.approverIds) as string[],
      })),
      isActive: wf.isActive,
      createdAt: wf.createdAt.toISOString(),
      updatedAt: wf.updatedAt.toISOString(),
    };
  }

  /**
   * Kiểm tra tính hợp lệ và lưu cấu hình luồng duyệt mới (tạo version mới)
   */
  static async saveWorkflow(input: SaveWorkflowInput): Promise<SavedWorkflow> {
    const { departmentId, ranges } = input;

    // 1. Kiểm tra phòng ban tồn tại và đang hoạt động
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) {
      throw new ApprovalWorkflowError('Phòng ban không tồn tại.', 404, 'DEPARTMENT_NOT_FOUND');
    }
    if (department.isActive === false) {
      throw new ApprovalWorkflowError('Phòng ban đã ngừng hoạt động.', 400, 'DEPARTMENT_INACTIVE');
    }

    // 2. Kiểm tra danh sách dải lương không rỗng
    if (!ranges || ranges.length === 0) {
      throw new ApprovalWorkflowError('Cấu hình phải có ít nhất một dải lương.', 400, 'EMPTY_RANGES');
    }

    // 3. Kiểm tra từng dải lương đơn lẻ
    const allApproverIds = new Set<string>();

    for (let index = 0; index < ranges.length; index++) {
      const r = ranges[index];
      const bandNum = index + 1;

      if (!Number.isSafeInteger(r.minSalary) || r.minSalary < 0) {
        throw new ApprovalWorkflowError(
          `Dải lương ${bandNum}: mức bắt đầu phải là số nguyên không âm.`,
          400,
          'INVALID_SALARY_RANGE'
        );
      }

      if (r.maxSalary !== null) {
        if (!Number.isSafeInteger(r.maxSalary) || r.maxSalary < r.minSalary) {
          throw new ApprovalWorkflowError(
            `Dải lương ${bandNum}: mức kết thúc phải lớn hơn hoặc bằng mức bắt đầu.`,
            400,
            'INVALID_SALARY_RANGE'
          );
        }
      }

      if (!r.approverIds || r.approverIds.length < 1 || r.approverIds.length > 3) {
        throw new ApprovalWorkflowError(
          `Dải lương ${bandNum}: chỉ được cấu hình từ 1 đến 3 cấp phê duyệt.`,
          400,
          'INVALID_APPROVAL_STEPS'
        );
      }

      if (r.approverIds.some((id) => !id || !String(id).trim())) {
        throw new ApprovalWorkflowError(
          `Dải lương ${bandNum}: hãy chọn đủ người phê duyệt ở tất cả các cấp.`,
          400,
          'MISSING_APPROVER'
        );
      }

      // Không được chọn trùng một người ở nhiều cấp trong cùng dải
      if (new Set(r.approverIds).size !== r.approverIds.length) {
        throw new ApprovalWorkflowError(
          `Dải lương ${bandNum}: không được chọn trùng một người ở nhiều cấp.`,
          400,
          'DUPLICATE_APPROVER_IN_RANGE'
        );
      }

      r.approverIds.forEach((id) => allApproverIds.add(id));
    }

    // 4. Kiểm tra sự tồn tại và vai trò của các người phê duyệt
    const approverUsers = await prisma.user.findMany({
      where: {
        id: { in: Array.from(allApproverIds) },
      },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    const approverMap = new Map(approverUsers.map((u) => [u.id, u]));

    for (const approverId of allApproverIds) {
      const user = approverMap.get(approverId);
      if (!user) {
        throw new ApprovalWorkflowError(
          `Người phê duyệt (ID: ${approverId}) không tồn tại trong hệ thống.`,
          400,
          'INVALID_APPROVER'
        );
      }

      if (user.isActive === false) {
        throw new ApprovalWorkflowError(
          `Người phê duyệt "${user.fullName}" (${user.email}) đã bị vô hiệu hóa hoặc không hoạt động.`,
          400,
          'INACTIVE_APPROVER'
        );
      }

      const roleNames = user.roles.map((r) => r.role.name);
      const isApproverEligible = roleNames.includes(RoleType.APPROVER);

      if (!isApproverEligible) {
        throw new ApprovalWorkflowError(
          `Tài khoản "${user.fullName}" (${user.email}) không có vai trò người phê duyệt (APPROVER).`,
          400,
          'APPROVER_ROLE_REQUIRED'
        );
      }
    }

    // 5. Kiểm tra tính liên tục, không chồng lấn, không khoảng trống
    const sorted = [...ranges].sort((a, b) => a.minSalary - b.minSalary);

    if (sorted[0].minSalary !== 0) {
      throw new ApprovalWorkflowError(
        'Dải lương đầu tiên phải bắt đầu từ 0 VNĐ.',
        400,
        'INVALID_SALARY_RANGE'
      );
    }

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];

      if (prev.maxSalary === null) {
        throw new ApprovalWorkflowError(
          'Chỉ dải lương cuối cùng mới được để mức kết thúc không giới hạn.',
          400,
          'INVALID_SALARY_RANGE'
        );
      }

      if (next.minSalary <= prev.maxSalary) {
        throw new ApprovalWorkflowError(
          'Các dải lương đang chồng lấn. Hãy kiểm tra lại điểm bắt đầu/kết thúc.',
          400,
          'OVERLAPPING_SALARY_RANGE'
        );
      }

      if (next.minSalary > prev.maxSalary + 1) {
        throw new ApprovalWorkflowError(
          'Các dải lương có khoảng trống. Mọi mức lương phải có luồng duyệt phù hợp.',
          400,
          'GAP_IN_SALARY_RANGES'
        );
      }

      // Quy tắc nghiệp vụ vượt hạn mức: Dải lương cao hơn không được có ít cấp duyệt hơn dải thấp
      if (next.approverIds.length < prev.approverIds.length) {
        throw new ApprovalWorkflowError(
          'Dải lương cao hơn không được có ít cấp phê duyệt hơn dải lương thấp.',
          400,
          'INVALID_APPROVAL_STEPS'
        );
      }
    }

    // Dải cao nhất phải để trống mức kết thúc (không giới hạn)
    if (sorted[sorted.length - 1].maxSalary !== null) {
      throw new ApprovalWorkflowError(
        'Dải lương cao nhất phải để trống mức kết thúc (không giới hạn).',
        400,
        'UNBOUNDED_TOP_RANGE_REQUIRED'
      );
    }

    // 6. Xử lý phiên bản mới (Versioning)
    const saved = await prisma.$transaction(async (tx) => {
      const latest = await tx.approvalWorkflow.findFirst({
        where: { departmentId },
        orderBy: { version: 'desc' },
      });

      const nextVersion = (latest?.version ?? 0) + 1;
      await tx.approvalWorkflow.updateMany({
        where: { departmentId, isActive: true },
        data: { isActive: false },
      });

      return tx.approvalWorkflow.create({
        data: {
          departmentId,
          version: nextVersion,
          isActive: true,
          ranges: {
            create: sorted.map((r, index) => ({
              minSalary: r.minSalary,
              maxSalary: r.maxSalary,
              orderIndex: index,
              approverIds: JSON.stringify(r.approverIds),
            })),
          },
        },
        include: {
          ranges: { orderBy: { orderIndex: 'asc' } },
        },
      });
    }).catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        throw new ApprovalWorkflowError(
          "Cấu hình vừa được thay đổi. Vui lòng tải lại và thử lại.",
          409,
          "WORKFLOW_VERSION_CONFLICT"
        );
      }
      throw error;
    });

    return {
      id: saved.id,
      departmentId: saved.departmentId,
      version: saved.version,
      ranges: saved.ranges.map((r) => ({
        minSalary: r.minSalary,
        maxSalary: r.maxSalary,
        approverIds: JSON.parse(r.approverIds) as string[],
      })),
      isActive: saved.isActive,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  /**
   * Tự động xác định chuỗi cấp duyệt cho một yêu cầu tuyển dụng
   * dựa trên phòng ban và mức lương đề xuất.
   */
  static async resolveApprovalChain(
    departmentId: string,
    salary: number | null | undefined
  ): Promise<{
    matched: boolean;
    reason?: string;
    workflowId?: string;
    workflowVersion?: number;
    approverIds: string[];
    steps: ApprovalStepSnapshot[];
    currentApproverId?: string;
  }> {
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: { departmentId, isActive: true },
      include: {
        ranges: { orderBy: { orderIndex: 'asc' } },
      },
      orderBy: { version: 'desc' },
    });

    if (!workflow || workflow.ranges.length === 0) {
      return {
        matched: false,
        reason: 'NO_WORKFLOW_CONFIGURED',
        approverIds: [],
        steps: [],
      };
    }

    const testSalary = salary !== null && salary !== undefined ? salary : 0;

    const matchedRange = workflow.ranges.find((r) => {
      const matchMin = testSalary >= r.minSalary;
      const matchMax = r.maxSalary === null || testSalary <= r.maxSalary;
      return matchMin && matchMax;
    });

    if (!matchedRange) {
      return {
        matched: false,
        reason: 'NO_MATCHING_RANGE',
        approverIds: [],
        steps: [],
      };
    }

    const approverIds = JSON.parse(matchedRange.approverIds) as string[];
    if (approverIds.length === 0) {
      return {
        matched: false,
        reason: 'EMPTY_APPROVER_LIST',
        approverIds: [],
        steps: [],
      };
    }

    // Kiểm tra tất cả người phê duyệt trong chuỗi phải đang tồn tại, hoạt động (isActive === true) và có vai trò APPROVER
    const activeApprovers = await prisma.user.findMany({
      where: {
        id: { in: approverIds },
        isActive: true,
      },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    const activeApproverMap = new Map(
      activeApprovers
        .filter((u) => u.roles.some((r) => r.role.name === RoleType.APPROVER))
        .map((u) => [u.id, u])
    );

    const hasInactiveOrMissing = approverIds.some((id) => !activeApproverMap.has(id));
    if (hasInactiveOrMissing) {
      return {
        matched: false,
        reason: 'NO_ACTIVE_APPROVER',
        approverIds: [],
        steps: [],
      };
    }

    const steps: ApprovalStepSnapshot[] = approverIds.map((id, index) => ({
      step: index + 1,
      approverId: id,
      status: index === 0 ? 'PENDING' : 'WAITING',
    }));

    return {
      matched: true,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      approverIds,
      steps,
      currentApproverId: approverIds[0],
    };
  }
}
