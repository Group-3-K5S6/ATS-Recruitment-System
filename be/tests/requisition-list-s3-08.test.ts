/**
 * S3-08 API danh sach yeu cau tuyen dung: isolated controller unit tests.
 * No database files, Prisma migrations, seed or live HTTP server are used.
 * Add to be/tests/ only in the isolated ATS-PR79-WORKTREE.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { RoleType } from '../src/rbac/roles';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('../src/database/prisma', () => ({
  prisma: { requisition: { findMany } },
}));

import { RequisitionController } from '../src/modules/requisitions/requisition.controller';

const baseDate = '2026-10-13T12:00:00.000Z';

type Query = Record<string, string>;
type UserFields = { id?: string; roles?: RoleType[]; departmentId?: string | null };

function sample(override: Record<string, unknown> = {}) {
  return {
    id: 'req-s3-08-test',
    title: 'S3-08 test requisition',
    status: 'PENDING_APPROVAL',
    createdAt: new Date('2026-10-10T23:59:00.000Z'),
    targetDate: new Date('2026-10-20T03:00:00.000Z'),
    jobs: [],
    ...override,
  };
}

async function callList(
  query: Query = {},
  user: UserFields = {},
) {
  const request = {
    query,
    user: {
      id: user.id ?? 'hr-test-id',
      roles: user.roles ?? [RoleType.HR_MANAGER],
      departmentId: user.departmentId === undefined ? 'dept-own' : user.departmentId,
    },
  } as unknown as Request;

  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);

  await RequisitionController.list(request, response as unknown as Response);
  return {
    code: response.status.mock.calls.at(-1)?.[0] as number | undefined,
    body: response.json.mock.calls.at(-1)?.[0] as {
      success: boolean;
      data?: Record<string, unknown>[];
      error?: { code: string };
    } | undefined,
    where: findMany.mock.calls.at(-1)?.[0]?.where,
  };
}

describe('S3-08 - API danh sach yeu cau tuyen dung (khong su dung database)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(baseDate));
    findMany.mockReset();
    findMany.mockResolvedValue([sample()]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC1: HR_MANAGER xem danh sach khong loc', async () => {
    const result = await callList();
    expect(result.code).toBe(200);
    expect(result.body?.success).toBe(true);
    expect(result.where).toEqual({});
  });

  it('AC1: loc ket hop trang thai, phong ban, recruiter va khoang ngay (bao gom ngay ket thuc)', async () => {
    const result = await callList({
      status: 'APPROVED',
      departmentId: 'dept-mkt',
      recruiterId: 'recruiter-123',
      fromDate: '2026-10-01',
      toDate: '2026-10-03',
    });
    expect(result.code).toBe(200);
    expect(result.where).toEqual({
      status: 'APPROVED',
      departmentId: 'dept-mkt',
      jobs: { some: { recruiterId: 'recruiter-123' } },
      createdAt: {
        gte: new Date('2026-10-01T00:00:00.000Z'),
        lt: new Date('2026-10-04T00:00:00.000Z'),
      },
    });
  });

  it('AC1: khong cho khoang ngay dao nguoc', async () => {
    const result = await callList({ fromDate: '2026-10-15', toDate: '2026-10-10' });
    expect(result.code).toBe(400);
    expect(result.body?.error?.code).toBe('VALIDATION_ERROR');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('AC1: khong chap nhan ngay khong hop le', async () => {
    const result = await callList({ fromDate: '13-10-2026' });
    expect(result.code).toBe(400);
    expect(result.body?.error?.code).toBe('VALIDATION_ERROR');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('RBAC: loc khong duoc lam mat gioi han phong ban cua HIRING_MANAGER', async () => {
    const result = await callList(
      { departmentId: 'dept-other', status: 'APPROVED' },
      { id: 'manager-1', roles: [RoleType.HIRING_MANAGER], departmentId: 'dept-own' },
    );
    expect(result.code).toBe(200);
    expect(result.where).toEqual({
      OR: [{ hiringManagerId: 'manager-1' }, { departmentId: 'dept-own' }],
      departmentId: 'dept-other',
      status: 'APPROVED',
    });
  });

  it('RBAC: APPROVER chi xem yeu cau duoc giao', async () => {
    const result = await callList({}, { id: 'approver-1', roles: [RoleType.APPROVER] });
    expect(result.code).toBe(200);
    expect(result.where).toEqual({ approverId: 'approver-1' });
  });

  it('RBAC: tu choi vai tro khong co quyen xem danh sach', async () => {
    const result = await callList({}, { roles: [RoleType.CANDIDATE] });
    expect(result.code).toBe(403);
    expect(result.body?.error?.code).toBe('FORBIDDEN_SCOPE');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('AC2: tra daysOpen va daysRemaining theo ngay UTC, khong bi lech boi gio', async () => {
    const result = await callList();
    expect(result.code).toBe(200);
    expect(result.body?.data?.[0]).toMatchObject({
      daysOpen: 3,
      daysRemaining: 7,
      isOverdue: false,
    });
  });

  it('AC2/AC3: yeu cau qua han 4 ngay co isOverdue = true', async () => {
    findMany.mockResolvedValue([sample({ targetDate: new Date('2026-10-09T23:50:00.000Z') })]);
    const result = await callList();
    expect(result.body?.data?.[0]).toMatchObject({
      daysOpen: 3,
      daysRemaining: -4,
      isOverdue: true,
    });
  });

  it('AC2/AC3: dung han hom nay thi daysRemaining = 0, chua qua han', async () => {
    findMany.mockResolvedValue([sample({ targetDate: new Date('2026-10-13T00:01:00.000Z') })]);
    const result = await callList();
    expect(result.body?.data?.[0]).toMatchObject({
      daysRemaining: 0,
      isOverdue: false,
    });
  });

  it('AC2/AC3: khong co ngay can nguoi thi daysRemaining = null', async () => {
    findMany.mockResolvedValue([sample({ targetDate: null })]);
    const result = await callList();
    expect(result.body?.data?.[0]).toMatchObject({
      daysOpen: 3,
      daysRemaining: null,
      isOverdue: false,
    });
  });

  it('AC3: yeu cau REJECTED hoac CANCELLED khong gan co qua han', async () => {
    findMany.mockResolvedValue([
      sample({ id: 'rejected', status: 'REJECTED', targetDate: new Date('2026-10-01') }),
      sample({ id: 'cancelled', status: 'CANCELLED', targetDate: new Date('2026-10-01') }),
    ]);
    const result = await callList();
    expect(result.body?.data?.map((r) => r.isOverdue)).toEqual([false, false]);
  });

  it('AC1: danh sach recruiter khong lap khi nhieu job chung nguoi phu trach', async () => {
    const recruiter = { id: 'rec-1', fullName: 'Recruiter 1', email: 'rec@example.test' };
    findMany.mockResolvedValue([sample({ jobs: [
      { id: 'job-1', recruiter },
      { id: 'job-2', recruiter },
      { id: 'job-3', recruiter: null },
    ] })]);
    const result = await callList();
    expect(result.body?.data?.[0].recruiters).toEqual([recruiter]);
  });
});
