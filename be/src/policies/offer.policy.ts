import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { prisma } from '../database/prisma';

export class OfferPolicy {
  static async canView(user: AuthenticatedUser, offerId: string): Promise<boolean> {
    // Interviewer cannot view offers
    if (user.roles.includes(RoleType.INTERVIEWER)) {
      return false;
    }

    if (
      user.roles.includes(RoleType.ADMIN) ||
      user.roles.includes(RoleType.HR_MANAGER) ||
      user.roles.includes(RoleType.RECRUITER)
    ) {
      return true;
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        application: {
          include: {
            candidate: true,
            job: true,
          },
        },
      },
    });

    if (!offer) return false;

    // Candidate: can only view their own offer once SENT or APPROVED
    if (user.roles.includes(RoleType.CANDIDATE)) {
      return (
        offer.application.candidate.userId === user.id &&
        ['APPROVED', 'SENT', 'ACCEPTED', 'DECLINED'].includes(offer.status)
      );
    }

    // Approver: can view offers assigned for approval
    if (user.roles.includes(RoleType.APPROVER)) {
      return !offer.approverId || offer.approverId === user.id;
    }

    // Hiring Manager: within their department's jobs
    if (user.roles.includes(RoleType.HIRING_MANAGER)) {
      const job = offer.application.job;
      return (
        job.hiringManagerId === user.id ||
        (!!user.departmentId && job.departmentId === user.departmentId)
      );
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

  static async canApprove(user: AuthenticatedUser, offerId: string): Promise<boolean> {
    if (user.roles.includes(RoleType.ADMIN) || user.roles.includes(RoleType.HR_MANAGER)) {
      return true;
    }

    if (user.roles.includes(RoleType.APPROVER)) {
      const offer = await prisma.offer.findUnique({ where: { id: offerId } });
      return !offer?.approverId || offer.approverId === user.id;
    }

    return false;
  }

  static sanitize(user: AuthenticatedUser, offer: any): any {
    if (!offer) return null;

    // For candidate: mask internal recruiter notes
    if (user.roles.includes(RoleType.CANDIDATE)) {
      const { internalNotes, ...safeOffer } = offer;
      return safeOffer;
    }

    return offer;
  }
}
