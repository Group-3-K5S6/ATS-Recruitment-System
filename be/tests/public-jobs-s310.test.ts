import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { findMany, findFirst, profile } = vi.hoisted(() => ({
  findMany: vi.fn(), findFirst: vi.fn(), profile: vi.fn(),
}));
vi.mock('../src/database/prisma', () => ({
  prisma: { job: { findMany, findFirst }, companyProfile: { findUnique: profile } },
}));

import publicJobsRoutes from '../src/modules/jobs/public-jobs.routes';

const app = express();
app.use('/api/public/jobs', publicJobsRoutes);

const publicJob = {
  id: 'published-test', title: 'Backend Developer', description: 'Mô tả tuyển dụng',
  status: 'PUBLISHED', location: 'Thái Nguyên', workMode: 'HYBRID',
  applicationDeadline: null, showSalary: false,
  department: { name: 'Kỹ thuật' }, jobTitle: { minSalary: 200, maxSalary: 300 },
  requisition: { requirements: 'TypeScript', proposedSalaryMin: 500, proposedSalaryMax: 1000 },
  approvedById: 'hidden-approver', publishedById: 'hidden-publisher',
  approvalNotes: 'hidden', rejectionReason: 'hidden',
};

describe('S3-10 anonymous public page contract', () => {
  beforeEach(() => { vi.clearAllMocks(); profile.mockResolvedValue(null); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('lists only published, approved jobs without login', async () => {
    findMany.mockResolvedValue([{ id: publicJob.id, title: publicJob.title }]);
    const res = await request(app).get('/api/public/jobs');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PUBLISHED');
    expect(where.approvedAt).toEqual({ not: null });
    expect(where.publishedAt).toEqual({ not: null });
  });

  it('returns 404 for draft, rejected or nonpublic jobs', async () => {
    findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/public/jobs/unpublished');
    expect(res.status).toBe(404);
    expect(findFirst.mock.calls[0][0].where.AND[1].status).toBe('PUBLISHED');
  });

  it('does not expose internal approver/publisher, notes, email or hidden salary', async () => {
    findFirst.mockResolvedValue(publicJob);
    const res = await request(app).get('/api/public/jobs/published-test');
    expect(res.status).toBe(200);
    expect(res.body.data.job.salary.showSalary).toBe(false);
    expect(JSON.stringify(res.body.data)).not.toContain('hidden-approver');
    expect(JSON.stringify(res.body.data)).not.toContain('hidden-publisher');
    expect(JSON.stringify(res.body.data)).not.toContain('approvalNotes');
    expect(JSON.stringify(res.body.data)).not.toContain('1000');
    expect(JSON.stringify(res.body.data)).not.toContain('500');
  });
});
