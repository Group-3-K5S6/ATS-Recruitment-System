import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { RoleType } from '../src/rbac/roles';

const { findJobById, findPublicJob, findProfile, canPreview } = vi.hoisted(() => ({
  findJobById: vi.fn(),
  findPublicJob: vi.fn(),
  findProfile: vi.fn(),
  canPreview: vi.fn(),
}));

vi.mock('../src/database/prisma', () => ({
  prisma: {
    job: { findUnique: findJobById, findFirst: findPublicJob },
    companyProfile: { findUnique: findProfile },
  },
}));

vi.mock('../src/policies/job.policy', () => ({
  JobPolicy: { canPreview },
}));

import { JobController } from '../src/modules/jobs/job.controller';
import publicJobsRoutes from '../src/modules/jobs/public-jobs.routes';

const app = express();
app.use('/api/public/jobs', publicJobsRoutes);

describe('S3-10 preview branding matches public job detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canPreview.mockResolvedValue(true);
    findJobById.mockResolvedValue({
      id: 'job-s310-preview',
      title: 'Backend Developer',
      description: 'Mô tả công việc tuyển dụng.',
      location: 'Hà Nội',
      workMode: 'HYBRID',
      applicationDeadline: null,
      showSalary: false,
      department: { name: 'Kỹ thuật' },
      jobTitle: null,
      requisition: { requirements: null, proposedSalaryMin: null, proposedSalaryMax: null },
    });
    findPublicJob.mockResolvedValue({
      id: 'job-s310-preview',
      title: 'Backend Developer',
      description: 'Mô tả công việc tuyển dụng.',
      location: 'Hà Nội',
      workMode: 'HYBRID',
      applicationDeadline: null,
      showSalary: false,
      department: { name: 'Kỹ thuật' },
      jobTitle: null,
      requisition: { requirements: null, proposedSalaryMin: null, proposedSalaryMax: null },
    });
    findProfile.mockResolvedValue({
      id: 'default',
      companyName: 'Tên thương hiệu chưa công khai',
      tagline: 'Thông điệp nội bộ',
      introduction: 'Giới thiệu nội bộ',
      culture: 'Văn hóa nội bộ',
      benefits: 'Phúc lợi nội bộ',
      website: 'https://internal.example.test',
      contactEmail: 'internal@example.test',
      location: 'Hà Nội',
      isPublished: false,
      logoData: null,
      bannerData: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('uses the public fallback brand when the company profile is not published', async () => {
    const req = {
      params: { id: 'job-s310-preview' },
      user: { id: 'hr-s310', roles: [RoleType.HR_MANAGER] },
    } as unknown as Request;
    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);

    await JobController.preview(req, res as unknown as Response);
    const preview = res.json.mock.calls.at(-1)?.[0]?.data;
    const publicResponse = await request(app).get('/api/public/jobs/job-s310-preview');

    expect(publicResponse.status).toBe(200);
    expect(preview.companyProfile).toMatchObject({
      companyName: 'ATS Recruitment',
      tagline: 'Kiến tạo tương lai cùng đội ngũ tinh hoa',
    });
    expect(preview.companyProfile.companyName).toBe(publicResponse.body.data.companyProfile.companyName);
    expect(preview.companyProfile.tagline).toBe(publicResponse.body.data.companyProfile.tagline);
  });
});
