import { Request, Response } from 'express';
import { prisma } from '../../database/prisma';
import { ReportPolicy } from '../../policies/report.policy';
import { successResponse, errorResponse } from '../../utils/response';

export class ReportController {
  static async getDashboard(req: Request, res: Response): Promise<void> {
    const user = req.user!;

    if (!ReportPolicy.canView(user)) {
      errorResponse(res, 'Access denied. You do not have report access.', 403, 'FORBIDDEN_ROLE');
      return;
    }

    const scopeFilter = ReportPolicy.getReportScopeFilter(user);

    const [totalJobs, totalCandidates, totalInterviews, totalOffers] = await Promise.all([
      prisma.job.count({
        where: scopeFilter.departmentId ? { departmentId: scopeFilter.departmentId } : {},
      }),
      prisma.candidate.count(),
      prisma.interview.count({
        where: scopeFilter.recruiterId
          ? { application: { assignedRecruiterId: scopeFilter.recruiterId } }
          : {},
      }),
      prisma.offer.count({
        where: scopeFilter.recruiterId ? { recruiterId: scopeFilter.recruiterId } : {},
      }),
    ]);

    successResponse(
      res,
      {
        scope: scopeFilter,
        metrics: {
          totalJobs,
          totalCandidates,
          totalInterviews,
          totalOffers,
        },
      },
      200
    );
  }
}
