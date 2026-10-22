import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma', () => ({
  prisma: { job: { findMany: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock('../src/middleware/audit-logger', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../src/database/prisma';
import { logAudit } from '../src/middleware/audit-logger';
import { expireDueJobs, millisecondsUntilNextVietnamMidnight } from '../src/modules/jobs/job-expiration.scheduler';
import { AuditAction } from '../src/rbac/types';

const findMany = vi.mocked(prisma.job.findMany);
const updateMany = vi.mocked(prisma.job.updateMany);
const audit = vi.mocked(logAudit);
const due = { id: 'job-test-08', title: 'Tin het han', applicationDeadline: new Date('2026-10-21T16:59:59.999Z') };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('S4-08 - tu dong an tin qua han', () => {
  it('Khong thay doi tin khi chua co tin het han', async () => {
    findMany.mockResolvedValue([]);
    expect(await expireDueJobs(new Date('2026-10-22T00:00:00Z'))).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('Chuyen PUBLISHED sang EXPIRED va ghi audit mot lan', async () => {
    findMany.mockResolvedValue([due] as never);
    updateMany.mockResolvedValue({ count: 1 });
    expect(await expireDueJobs(new Date('2026-10-22T00:00:00Z'))).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: due.id, status: 'PUBLISHED' }),
      data: { status: 'EXPIRED' },
    }));
    expect(audit).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.JOB_POSTING_EXPIRED, resourceId: due.id,
    }));
  });

  it('Khong ghi audit trung neu job da duoc tien trinh khac cap nhat', async () => {
    findMany.mockResolvedValue([due] as never);
    updateMany.mockResolvedValue({ count: 0 });
    expect(await expireDueJobs(new Date('2026-10-22T00:00:00Z'))).toBe(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it('Tinh lich chay tiep theo theo nua dem Viet Nam', () => {
    expect(millisecondsUntilNextVietnamMidnight(new Date('2026-10-22T16:59:00Z'))).toBe(60_000);
    expect(millisecondsUntilNextVietnamMidnight(new Date('2026-10-22T17:00:00Z'))).toBe(86_400_000);
  });
});
