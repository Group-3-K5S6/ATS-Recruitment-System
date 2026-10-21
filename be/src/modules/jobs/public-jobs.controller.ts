import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { successResponse, errorResponse } from '../../utils/response';
import type { Prisma } from '@prisma/client';

export const WORK_MODES = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
export type WorkModeType = (typeof WORK_MODES)[number];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeWorkMode(raw?: string | null): WorkModeType | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper === 'ALL' || upper === '') return null;
  if (upper === 'ONSITE' || upper === 'VĂN PHÒNG' || upper === 'TẠI VĂN PHÒNG') return 'ONSITE';
  if (upper === 'HYBRID' || upper === 'LINH HOẠT' || upper === 'KẾT HỢP') return 'HYBRID';
  if (upper === 'REMOTE' || upper === 'TỪ XA' || upper === 'LÀM VIỆC TỪ XA') return 'REMOTE';
  return null;
}

export const publicJobsQuerySchema = z.object({
  department: z.string().trim().optional(),
  departmentId: z
    .string()
    .trim()
    .refine((val) => !val || UUID_REGEX.test(val), {
      message: 'departmentId phải là UUID hợp lệ.',
    })
    .optional(),
  location: z.string().trim().optional(),
  workMode: z.string().trim().optional(),
  employmentType: z.string().trim().optional(),
  search: z.string().trim().optional(),
  keyword: z.string().trim().optional(),
  q: z.string().trim().optional(),
  page: z
    .preprocess(
      (v) => (v === undefined || v === '' ? undefined : Number(v)),
      z
        .number({ invalid_type_error: 'page phải là số nguyên.' })
        .int('page phải là số nguyên.')
        .positive('page phải lớn hơn 0.')
    )
    .optional(),
  limit: z
    .preprocess(
      (v) => (v === undefined || v === '' ? undefined : Number(v)),
      z
        .number({ invalid_type_error: 'limit phải là số nguyên.' })
        .int('limit phải là số nguyên.')
        .positive('limit phải lớn hơn 0.')
        .max(100, 'limit tối đa là 100.')
    )
    .optional(),
  offset: z
    .preprocess(
      (v) => (v === undefined || v === '' ? undefined : Number(v)),
      z
        .number({ invalid_type_error: 'offset phải là số nguyên.' })
        .int('offset phải là số nguyên.')
        .nonnegative('offset không được âm.')
    )
    .optional(),
  paginate: z.string().trim().optional(),
});

export type PublicJobsQuery = z.infer<typeof publicJobsQuerySchema>;

export const publishedWhere = () => ({
  status: 'PUBLISHED',
  approvedAt: { not: null },
  publishedAt: { not: null },
  OR: [
    { applicationDeadline: null },
    { applicationDeadline: { gte: new Date() } },
  ],
});

export class PublicJobsController {
  /**
   * SCRUM-116: Lấy danh sách việc làm đang tuyển công khai
   * Không yêu cầu đăng nhập, chỉ trả về tin đã xuất bản & còn hạn.
   * Hỗ trợ tìm kiếm từ khóa trong tiêu đề, mô tả và lọc theo phòng ban, địa điểm, hình thức làm việc.
   */
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedQuery = publicJobsQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        const issues = parsedQuery.error.errors.map((e) => e.message).join(', ');
        errorResponse(res, `Tham số không hợp lệ: ${issues}`, 400, 'VALIDATION_ERROR');
        return;
      }

      const query = parsedQuery.data;

      // Kiểm tra tính hợp lệ của workMode / employmentType nếu người dùng truyền vào
      const rawWorkMode = (query.workMode || query.employmentType || '').trim();
      let targetWorkMode: WorkModeType | null = null;
      if (rawWorkMode !== '' && rawWorkMode.toUpperCase() !== 'ALL') {
        targetWorkMode = normalizeWorkMode(rawWorkMode);
        if (!targetWorkMode) {
          errorResponse(
            res,
            'Hình thức làm việc không hợp lệ. Giá trị hợp lệ: ONSITE, HYBRID, REMOTE.',
            400,
            'VALIDATION_ERROR'
          );
          return;
        }
      }

      const now = new Date();
      const andConditions: Prisma.JobWhereInput[] = [
        {
          OR: [
            { applicationDeadline: null },
            { applicationDeadline: { gte: now } },
          ],
        },
      ];

      // 1. Lọc theo phòng ban
      if (query.departmentId && query.departmentId.trim() !== '') {
        andConditions.push({ departmentId: query.departmentId.trim() });
      } else if (query.department && query.department.trim() !== '' && query.department.trim().toUpperCase() !== 'ALL') {
        const deptTerm = query.department.trim();
        if (UUID_REGEX.test(deptTerm)) {
          andConditions.push({ departmentId: deptTerm });
        } else {
          andConditions.push({
            department: {
              OR: [
                { name: { contains: deptTerm } },
                { code: { contains: deptTerm } },
              ],
            },
          });
        }
      }

      // 2. Lọc theo địa điểm
      if (query.location && query.location.trim() !== '' && query.location.trim().toUpperCase() !== 'ALL') {
        andConditions.push({
          location: { contains: query.location.trim() },
        });
      }

      // 3. Lọc theo hình thức làm việc
      if (targetWorkMode) {
        andConditions.push({
          workMode: targetWorkMode,
        });
      }

      // 4. Tìm kiếm từ khóa trong tiêu đề và mô tả công việc
      const searchKeyword = (query.keyword || query.search || query.q || '').trim();
      if (searchKeyword) {
        andConditions.push({
          OR: [
            { title: { contains: searchKeyword } },
            { description: { contains: searchKeyword } },
          ],
        });
      }

      const whereClause: Prisma.JobWhereInput = {
        status: 'PUBLISHED',
        approvedAt: { not: null },
        publishedAt: { not: null },
        AND: andConditions,
      };

      const selectFields = {
        id: true,
        title: true,
        description: true,
        location: true,
        workMode: true,
        applicationDeadline: true,
        publishedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        jobTitle: {
          select: {
            id: true,
            name: true,
          },
        },
      };

      const hasPagination = query.limit !== undefined || query.page !== undefined || query.offset !== undefined;
      const limit =
        query.limit !== undefined
          ? query.limit
          : query.page !== undefined || query.paginate === 'true'
          ? 10
          : undefined;
      const page = query.page !== undefined ? query.page : 1;
      const skip =
        query.offset !== undefined
          ? query.offset
          : limit !== undefined
          ? (page - 1) * limit
          : undefined;

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where: whereClause,
          select: selectFields,
          orderBy: { publishedAt: 'desc' },
          ...(limit !== undefined ? { take: limit } : {}),
          ...(skip !== undefined ? { skip } : {}),
        }),
        hasPagination || query.paginate === 'true'
          ? prisma.job.count({ where: whereClause })
          : Promise.resolve(0),
      ]);

      if (hasPagination || query.paginate === 'true') {
        res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
        res.setHeader('X-Total-Count', String(total));
      }

      if (query.paginate === 'true') {
        const take = limit || jobs.length || 10;
        const totalPages = take > 0 ? Math.ceil(total / take) : 0;
        successResponse(res, {
          items: jobs,
          total,
          page,
          limit: take,
          totalPages,
        });
        return;
      }

      successResponse(res, jobs);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Chi tiết tin tuyển dụng công khai theo ID
   */
  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await prisma.job.findFirst({
        where: { AND: [{ id: req.params.id }, publishedWhere()] },
        select: {
          id: true,
          title: true,
          description: true,
          location: true,
          workMode: true,
          applicationDeadline: true,
          showSalary: true,
          department: { select: { id: true, name: true, code: true } },
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
      const displayText =
        min != null && max != null
          ? `${min.toLocaleString('vi-VN')} - ${fmt(max)}`
          : min != null
          ? `Từ ${fmt(min)}`
          : max != null
          ? `Lên đến ${fmt(max)}`
          : 'Thoả thuận';

      const profile = await prisma.companyProfile.findUnique({
        where: { id: 'default' },
        select: { companyName: true, tagline: true, isPublished: true },
      });

      // Deliberately exclude internal approver/publisher IDs, emails, notes and audit logs.
      successResponse(res, {
        job: {
          id: job.id,
          title: job.title,
          description: job.description,
          location: job.location,
          workMode: job.workMode,
          applicationDeadline: job.applicationDeadline,
          department: job.department,
          requisition: { requirements: job.requisition?.requirements ?? null },
          salary: { showSalary: job.showSalary, displayText },
        },
        companyProfile: profile?.isPublished
          ? { companyName: profile.companyName, tagline: profile.tagline }
          : { companyName: 'ATS Recruitment', tagline: 'Kiến tạo tương lai cùng đội ngũ tinh hoa' },
      });
    } catch (err) {
      next(err);
    }
  }
}
