import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { prisma } from '../database/prisma';

export class RequisitionPolicy {
  static async canView(user: AuthenticatedUser, requisitionId: string): Promise<boolean> {
    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER)
    ) {
      return true;
    }

    const req = await prisma.requisition.findUnique({
      where: { id: requisitionId },
    });

    if (!req) return false;

    if (user.roles.includes(RoleType.APPROVER)) {
      return req.approverId === user.id;
    }

    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      return req.hiringManagerId === user.id || (!!user.departmentId && req.departmentId === user.departmentId);
    }

    return false;
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
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { isActive: true, managerId: true },
      });
      // Department.managerId is the authoritative assignment for the department.
      // A hiring manager may be responsible for a newly created department even
      // when their profile's primary department is different.
      return !!department && department.isActive && department.managerId === user.id;
    }

    return false;
  }

  static async canUpdate(user: AuthenticatedUser, requisitionId: string): Promise<boolean> {
    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER)
    ) {
      return true;
    }

    const req = await prisma.requisition.findUnique({
      where: { id: requisitionId },
    });

    if (!req) return false;

    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      return req.hiringManagerId === user.id || (!!user.departmentId && req.departmentId === user.departmentId);
    }

    return false;
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
