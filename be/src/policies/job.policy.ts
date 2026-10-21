import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { prisma } from '../database/prisma';

export class JobPolicy {
 static async canView(
  user: AuthenticatedUser,
  jobId: string
): Promise<boolean> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return false;
  }

  if (
    user.roles.includes(RoleType.ADMIN) ||
    user.roles.includes(RoleType.HR_MANAGER)
  ) {
    return true;
  }

  if (user.roles.includes(RoleType.HIRING_MANAGER)) {
    return (
      job.hiringManagerId === user.id ||
      (
        !!user.departmentId &&
        job.departmentId === user.departmentId
      )
    );
  }

  if (user.roles.includes(RoleType.RECRUITER)) {
    return job.recruiterId === user.id;
  }

  if (user.roles.includes(RoleType.APPROVER)) {
    const assignedJob = await prisma.job.findFirst({
      where: {
        id: jobId,
        requisition: {
          is: {
            approverId: user.id,
          },
        },
      },
      select: {
        id: true,
      },
    });

    return assignedJob !== null;
  }

  if (user.roles.includes(RoleType.CANDIDATE)) {
    return job.status === 'PUBLISHED' || job.status === 'CLOSED';
  }

  return false;
}

  static async canCreate(user: AuthenticatedUser): Promise<boolean> {
    return (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER)
    );
  }

  static async canUpdate(user: AuthenticatedUser, jobId: string): Promise<boolean> {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return false;

    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      return true;
    }

    if (user.roles.includes(RoleType.RECRUITER)) {
      // A missing assignment must never grant permissions to all recruiters.
      return job.recruiterId === user.id;
    }

    return false;
  }

  /**
   * SCRUM-105: Chỉ Trưởng phòng Nhân sự (HR_MANAGER) và ADMIN được phê duyệt tin tuyển dụng
   */
  static async canApprove(user: AuthenticatedUser, _jobId?: string): Promise<boolean> {
    return (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER)
    );
  }

  /**
   * SCRUM-105: Chỉ Trưởng phòng Nhân sự (HR_MANAGER) và ADMIN được xuất bản / gỡ tin tuyển dụng
   */
  static async canPublish(user: AuthenticatedUser, _jobId?: string): Promise<boolean> {
    return (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER)
    );
  }

  /**
   * SCRUM-105: Xem trước tin tuyển dụng đúng như giao diện công khai trước khi xuất bản
   */
  static async canPreview(user: AuthenticatedUser, jobId: string): Promise<boolean> {
    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER)
    ) {
      return true;
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return false;

    if (user.roles.includes(RoleType.RECRUITER)) {
      return job.recruiterId === user.id;
    }

    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      return (
        job.hiringManagerId === user.id ||
        (!!user.departmentId && job.departmentId === user.departmentId)
      );
    }

    // CANDIDATE và INTERVIEWER không được phép xem trước tin tuyển dụng nội bộ
    return false;
  }

  /**
   * Cho phép nộp tin tuyển dụng để chờ duyệt
   */
  static async canSubmitForApproval(user: AuthenticatedUser, jobId: string): Promise<boolean> {
    // Chia tách nhiệm vụ: chỉ RECRUITER được phân công mới gửi duyệt.
    // HR_MANAGER / ADMIN không được tự gửi rồi tự phê duyệt,
    // kể cả khi đồng thời được gán vai trò Recruiter.
    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      return false;
    }
    if (!user.roles.includes(RoleType.RECRUITER)) return false;
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    return job?.recruiterId === user.id;
  }
}

