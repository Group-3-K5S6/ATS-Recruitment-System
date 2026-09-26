"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportController = void 0;
const prisma_1 = require("../../database/prisma");
const report_policy_1 = require("../../policies/report.policy");
const response_1 = require("../../utils/response");
class ReportController {
    static async getDashboard(req, res) {
        const user = req.user;
        if (!report_policy_1.ReportPolicy.canView(user)) {
            (0, response_1.errorResponse)(res, 'Access denied. You do not have report access.', 403, 'FORBIDDEN_ROLE');
            return;
        }
        const scopeFilter = report_policy_1.ReportPolicy.getReportScopeFilter(user);
        const [totalJobs, totalCandidates, totalInterviews, totalOffers] = await Promise.all([
            prisma_1.prisma.job.count({
                where: scopeFilter.departmentId ? { departmentId: scopeFilter.departmentId } : {},
            }),
            prisma_1.prisma.candidate.count(),
            prisma_1.prisma.interview.count({
                where: scopeFilter.recruiterId
                    ? { application: { assignedRecruiterId: scopeFilter.recruiterId } }
                    : {},
            }),
            prisma_1.prisma.offer.count({
                where: scopeFilter.recruiterId ? { recruiterId: scopeFilter.recruiterId } : {},
            }),
        ]);
        (0, response_1.successResponse)(res, {
            scope: scopeFilter,
            metrics: {
                totalJobs,
                totalCandidates,
                totalInterviews,
                totalOffers,
            },
        }, 200);
    }
}
exports.ReportController = ReportController;
