import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { prisma } from '../database/prisma';

export class RequisitionPolicy {
  static async canView(user: AuthenticatedUser, requisitionId: string): Promise<boolean> {
    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER)
    ) {
      return true;
    }

    const req = await prisma.requisition.findUnique({
      where: { id: requisitionId },
      include: {
        supportingRecruiters: true,
      },
    });

    if (!req) return false;

    if (user.roles.includes(RoleType.RECRUITER)) {
      return (
        req.leadRecruiterId === user.id ||
        req.supportingRecruiters.some((s) => s.recruiterId === user.id) ||
        req.hiringManagerId === user.id
      );
    }

    if (user.roles.includes(RoleType.APPROVER)) {
      return req.approverId === user.id; // Only assigned requisitions may be viewed
    }

    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      return req.hiringManagerId === user.id || (!!user.departmentId && req.departmentId === user.departmentId);
    }

    return false;
  }

  static canAssign(user: AuthenticatedUser): boolean {
    return (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER)
    );
  }

  static async canCreate(user: AuthenticatedUser, departmentId: string): Promise<boolean> {
    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER)
    ) {
      return true;
    }

    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      // Must be within their own department
      return !!user.departmentId && user.departmentId === departmentId;
    }

    return false;
  }

  static async canUpdate(user: AuthenticatedUser, requisitionId: string): Promise<boolean> {
    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER)
    ) {
      return true;
    }

    const req = await prisma.requisition.findUnique({
      where: { id: requisitionId },
      include: { supportingRecruiters: true },
    });

    if (!req) return false;

    if (
      user.roles.includes(RoleType.RECRUITER) &&
      (req.leadRecruiterId === user.id ||
        req.supportingRecruiters.some((s) => s.recruiterId === user.id))
    ) {
      return true;
    }

    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      return req.hiringManagerId === user.id || (!!user.departmentId && req.departmentId === user.departmentId);
    }

    return false;
  }

  /**
   * SCRUM-99: Chỉ Trưởng phòng Nhân sự (HR_MANAGER) và Admin mới có thể
   * tạm dừng, đóng hoặc đánh dấu đã tuyển đủ một yêu cầu tuyển dụng.
   */
  static async canClose(user: AuthenticatedUser, _requisitionId: string): Promise<boolean> {
    return (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER)
    );
  }

  static async canApprove(user: AuthenticatedUser, requisitionId: string): Promise<boolean> {
    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      return true;
    }

    if (user.roles.includes(RoleType.APPROVER)) {
      const req = await prisma.requisition.findUnique({
        where: { id: requisitionId },
      });
      if (!req) return false;
      return req.approverId === user.id;
    }

    return false;
  }
}
