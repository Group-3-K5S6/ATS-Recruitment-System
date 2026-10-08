import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma';
import { errorResponse, successResponse } from '../../utils/response';

export const createJobTitleSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  level: z.string().trim().min(1).max(50),
  minSalary: z.number().positive(),
  maxSalary: z.number().positive(),
}).refine((value) => value.minSalary <= value.maxSalary, {
  message: 'Mức lương tối thiểu không được lớn hơn mức lương tối đa.',
  path: ['maxSalary'],
});

export const updateJobTitleSchema = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(1).max(150).optional(),
  level: z.string().trim().min(1).max(50).optional(),
  minSalary: z.number().positive().optional(),
  maxSalary: z.number().positive().optional(),
}).refine((value) => value.minSalary === undefined || value.maxSalary === undefined || value.minSalary <= value.maxSalary, {
  message: 'Mức lương tối thiểu không được lớn hơn mức lương tối đa.',
  path: ['maxSalary'],
});

export class JobTitleController {
  static async options(_req: Request, res: Response): Promise<void> {
    const options = await prisma.jobTitle.findMany({
      select: { id: true, code: true, name: true, level: true },
      orderBy: [{ name: 'asc' }, { level: 'asc' }],
    });
    successResponse(res, options);
  }

  static async list(_req: Request, res: Response): Promise<void> {
    const jobTitles = await prisma.jobTitle.findMany({ orderBy: [{ name: 'asc' }, { level: 'asc' }] });
    successResponse(res, jobTitles);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const jobTitle = await prisma.jobTitle.create({ data: req.body });
    successResponse(res, jobTitle, 201, 'Đã tạo chức danh và dải lương.');
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const current = await prisma.jobTitle.findUnique({ where: { id } });
    if (!current) {
      errorResponse(res, 'Không tìm thấy chức danh.', 404, 'NOT_FOUND');
      return;
    }

    const minSalary = req.body.minSalary ?? current.minSalary;
    const maxSalary = req.body.maxSalary ?? current.maxSalary;
    if (minSalary > maxSalary) {
      errorResponse(res, 'Mức lương tối thiểu không được lớn hơn mức lương tối đa.', 400, 'INVALID_SALARY_RANGE');
      return;
    }

    const jobTitle = await prisma.jobTitle.update({ where: { id }, data: req.body });
    successResponse(res, jobTitle, 200, 'Đã cập nhật chức danh và dải lương.');
  }

  static async delete(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const current = await prisma.jobTitle.findUnique({ where: { id }, include: { _count: { select: { jobs: true } } } });
    if (!current) {
      errorResponse(res, 'Không tìm thấy chức danh.', 404, 'NOT_FOUND');
      return;
    }
    if (current._count.jobs > 0) {
      errorResponse(res, 'Không thể xóa chức danh đang được sử dụng bởi tin tuyển dụng.', 409, 'JOB_TITLE_IN_USE');
      return;
    }

    await prisma.jobTitle.delete({ where: { id } });
    successResponse(res, { id }, 200, 'Đã xóa chức danh.');
  }
}
