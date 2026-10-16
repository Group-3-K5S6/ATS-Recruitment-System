import { Router } from 'express';
import { prisma } from '../../database/prisma';
import { successResponse, errorResponse } from '../../utils/response';

// Minimal public read-only view for S3-10 publication acceptance.
// Full search/application workflow belongs to Sprint 4.
const router = Router();

const publishedWhere = () => ({
  status: 'PUBLISHED',
  approvedAt: { not: null },
  publishedAt: { not: null },
  OR: [
    { applicationDeadline: null },
    { applicationDeadline: { gte: new Date() } },
  ],
});

router.get('/', async (_req, res, next) => {
  try {
    const jobs = await prisma.job.findMany({
      where: publishedWhere(),
      select: {
        id: true, title: true, location: true, workMode: true,
        applicationDeadline: true, department: { select: { name: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });
    successResponse(res, jobs);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const job = await prisma.job.findFirst({
      where: { AND: [{ id: req.params.id }, publishedWhere()] },
      select: {
        id: true, title: true, description: true, location: true,
        workMode: true, applicationDeadline: true, showSalary: true,
        department: { select: { name: true } },
        jobTitle: { select: { minSalary: true, maxSalary: true } },
        requisition: { select: { requirements: true, proposedSalaryMin: true, proposedSalaryMax: true } },
      },
    });
    if (!job) {
      errorResponse(res, 'Tin tuyển dụng không tồn tại hoặc chưa được công khai.', 404, 'NOT_FOUND');
      return;
    }

    const min = job.showSalary ? (job.requisition?.proposedSalaryMin ?? job.jobTitle?.minSalary ?? null) : null;
    const max = job.showSalary ? (job.requisition?.proposedSalaryMax ?? job.jobTitle?.maxSalary ?? null) : null;
    const fmt = (n: number) => n.toLocaleString('vi-VN') + ' VNĐ';
    const displayText = min != null && max != null
      ? `${min.toLocaleString('vi-VN')} - ${fmt(max)}`
      : min != null ? `Từ ${fmt(min)}`
      : max != null ? `Lên đến ${fmt(max)}` : 'Thoả thuận';

    const profile = await prisma.companyProfile.findUnique({
      where: { id: 'default' },
      select: { companyName: true, tagline: true, isPublished: true },
    });
    // Deliberately exclude internal approver/publisher IDs, emails, notes and audit logs.
    successResponse(res, {
      job: {
        id: job.id, title: job.title, description: job.description,
        location: job.location, workMode: job.workMode,
        applicationDeadline: job.applicationDeadline,
        department: job.department,
        requisition: { requirements: job.requisition?.requirements ?? null },
        salary: { showSalary: job.showSalary, displayText },
      },
      companyProfile: profile?.isPublished
        ? { companyName: profile.companyName, tagline: profile.tagline }
        : { companyName: 'ATS Recruitment', tagline: 'Kiến tạo tương lai cùng đội ngũ tinh hoa' },
    });
  } catch (err) { next(err); }
});

export default router;
