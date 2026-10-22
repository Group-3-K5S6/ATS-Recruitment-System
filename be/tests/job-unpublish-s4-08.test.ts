import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma', () => ({
  prisma: { job: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('../src/middleware/audit-logger', () => ({ recordRequestAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/utils/response', () => ({ successResponse: vi.fn(), errorResponse: vi.fn() }));

import { prisma } from '../src/database/prisma';
import { JobPolicy } from '../src/policies/job.policy';
import { JobController } from '../src/modules/jobs/job.controller';
import { errorResponse, successResponse } from '../src/utils/response';
import { RoleType } from '../src/rbac/roles';
import type { AuthenticatedUser } from '../src/rbac/types';
import type { Request, Response } from 'express';

const findUnique = vi.mocked(prisma.job.findUnique);
const update = vi.mocked(prisma.job.update);
const success = vi.mocked(successResponse);
const failure = vi.mocked(errorResponse);

const recruiter: AuthenticatedUser = {
  id: 'recruiter-1', email: 'recruiter1@test.local', fullName: 'Recruiter 1',
  departmentId: null, roles: [RoleType.RECRUITER], permissions: [],
};

beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('S4-08 - quyen go tin', () => {
  it('Recruiter chi duoc go tin minh phu trach', async () => {
    findUnique.mockResolvedValueOnce({ recruiterId: recruiter.id } as never)
      .mockResolvedValueOnce({ recruiterId: 'recruiter-2' } as never);
    expect(await JobPolicy.canUnpublish(recruiter, 'job-1')).toBe(true);
    expect(await JobPolicy.canUnpublish(recruiter, 'job-2')).toBe(false);
  });

  it('HR Manager va Admin co quyen tren tin toan he thong', async () => {
    expect(await JobPolicy.canUnpublish({ ...recruiter, roles: [RoleType.HR_MANAGER] }, 'job-1')).toBe(true);
    expect(await JobPolicy.canUnpublish({ ...recruiter, roles: [RoleType.ADMIN] }, 'job-1')).toBe(true);
  });

  it('Recruiter khong duoc phat hanh tin neu khong co quyen duyet', async () => {
    expect(await JobPolicy.canPublish(recruiter, 'job-1')).toBe(false);
  });

  it('Gỡ tin PUBLISHED ve CLOSED sau khi policy cho phep', async () => {
    vi.spyOn(JobPolicy, 'canUnpublish').mockResolvedValue(true);
    findUnique.mockResolvedValue({ id: 'job-1', status: 'PUBLISHED' } as never);
    update.mockResolvedValue({ id: 'job-1', title: 'Tin test', status: 'CLOSED' } as never);
    const req = { params: { id: 'job-1' }, user: recruiter } as unknown as Request;
    await JobController.unpublish(req, {} as Response);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-1' }, data: { status: 'CLOSED' },
    }));
    expect(success).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'CLOSED' }), 200, expect.any(String));
  });

  it('Khong go tin neu policy tu choi', async () => {
    vi.spyOn(JobPolicy, 'canUnpublish').mockResolvedValue(false);
    await JobController.unpublish({ params: { id: 'job-1' }, user: recruiter } as unknown as Request, {} as Response);
    expect(update).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith(expect.anything(), expect.any(String), 403, 'FORBIDDEN_SCOPE');
  });
});
