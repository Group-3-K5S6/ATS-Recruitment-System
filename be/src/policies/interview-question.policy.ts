import { AuthenticatedUser } from '../rbac/types';
import { RoleType } from '../rbac/roles';
import { PermissionCode } from '../rbac/permissions';
import { prisma } from '../database/prisma';

export class InterviewQuestionPolicy {
  /**
   * Check if user can view interview questions
   */
  static canView(user: AuthenticatedUser): boolean {
    if (user.roles.includes(RoleType.ADMIN)) {
      return true;
    }
    return user.permissions.includes(PermissionCode.INTERVIEW_QUESTIONS_READ);
  }

  /**
   * Check if user can create interview questions
   */
  static canCreate(user: AuthenticatedUser): boolean {
    if (user.roles.includes(RoleType.ADMIN)) {
      return true;
    }
    return user.permissions.includes(PermissionCode.INTERVIEW_QUESTIONS_CREATE);
  }

  /**
   * Check if user can update an interview question
   */
  static async canUpdate(user: AuthenticatedUser, questionId: string): Promise<boolean> {
    if (user.roles.includes(RoleType.ADMIN)) {
      return true;
    }
    if (!user.permissions.includes(PermissionCode.INTERVIEW_QUESTIONS_UPDATE)) {
      return false;
    }
    const question = await prisma.interviewQuestion.findUnique({
      where: { id: questionId },
    });
    return !!question;
  }

  /**
   * Check if user can delete an interview question
   */
  static async canDelete(user: AuthenticatedUser, questionId: string): Promise<boolean> {
    if (user.roles.includes(RoleType.ADMIN)) {
      return true;
    }
    if (!user.permissions.includes(PermissionCode.INTERVIEW_QUESTIONS_DELETE)) {
      return false;
    }
    const question = await prisma.interviewQuestion.findUnique({
      where: { id: questionId },
    });
    return !!question;
  }
}
