import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

describe('PR64 + PR68 - Approval integration', () => {
  let hrToken: string;
  let hrId: string;
  let approverToken: string;
  let approverId: string;
  let departmentId: string;
  let jobTitleId = '';

  const createdIds: string[] = [];

  beforeAll(async () => {
    const hr = await loginAndGetToken('hr_manager@ats.local');
    const approver = await loginAndGetToken('approver@ats.local');

    hrToken = hr.token;
    hrId = hr.user.id;
    departmentId = hr.user.departmentId;
    await prisma.departmentHeadcountBudget.upsert({
      where: { departmentId_year: { departmentId, year: 2099 } },
      create: { departmentId, year: 2099, headcount: 10000 },
      update: { headcount: 10000 },
    });
    approverToken = approver.token;
    approverId = approver.user.id;

    const jobTitle = await prisma.jobTitle.create({
      data: {
        id: randomUUID(),
        code: `PR64-${randomUUID().slice(0, 8)}`,
        name: 'Integration test PR64',
        level: 'Nhân viên',
        minSalary: 10000000,
        maxSalary: 30000000,
      },
    });

    jobTitleId = jobTitle.id;
  });

  afterAll(async () => {
    if (departmentId) {
      await prisma.departmentHeadcountBudget.deleteMany({
        where: { departmentId, year: 2099 },
      });
    }
    if (createdIds.length > 0) {
      await prisma.requisition.deleteMany({
        where: { id: { in: createdIds } },
      });
    }

    if (jobTitleId) {
      await prisma.jobTitle.deleteMany({
        where: { id: jobTitleId },
      });
    }
  });

  async function createRequisition(): Promise<string> {
    const response = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hrToken))
      .send({
        departmentId,
        jobTitleId,
        reason: 'NEW',
        headcount: 1,
        proposedSalaryMin: 10000000,
        proposedSalaryMax: 20000000,
        targetDate: '2099-12-31T00:00:00.000Z',
        description: 'Test tích hợp phê duyệt.',
        requirements: 'Kiểm thử SCRUM-87 và SCRUM-91.',
        approverId,
      });

    expect(response.status).toBe(201);

    const id: string = response.body.data.id;
    createdIds.push(id);

    return id;
  }

  it('duyet 2 cap ghi 2 lich su va chuyen trang thai dung', async () => {
    const id = await createRequisition();

    // Mo phong snapshot hai cap de kiem tra controller.
    await prisma.requisition.update({
      where: { id },
      data: {
        status: 'PENDING_APPROVAL',
        approverId,
        approvalChain: JSON.stringify([
          { approverId, status: 'PENDING' },
          { approverId: hrId, status: 'WAITING' },
        ]),
      },
    });

    const first = await request(app)
      .post(`/api/requisitions/${id}/approve`)
      .set(authHeader(approverToken))
      .send({ decision: 'APPROVE', notes: 'Duyệt cấp 1' });

    expect(first.status).toBe(200);

    const afterFirst = await prisma.requisition.findUniqueOrThrow({
      where: { id },
    });

    expect(afterFirst.status).toBe('PENDING_APPROVAL');
    expect(afterFirst.approverId).toBe(hrId);

    const historyAfterFirst =
      await prisma.requisitionApprovalHistory.findMany({
        where: { requisitionId: id },
      });

    expect(historyAfterFirst).toHaveLength(1);
    expect(historyAfterFirst[0].actorId).toBe(approverId);
    expect(historyAfterFirst[0].decision).toBe('APPROVE');
    expect(historyAfterFirst[0].toStatus).toBe('PENDING_APPROVAL');

    const second = await request(app)
      .post(`/api/requisitions/${id}/approve`)
      .set(authHeader(hrToken))
      .send({ decision: 'APPROVE', notes: 'Duyệt cấp 2' });

    expect(second.status).toBe(200);

    const afterSecond = await prisma.requisition.findUniqueOrThrow({
      where: { id },
    });

    expect(afterSecond.status).toBe('APPROVED');

    const finalHistory =
      await prisma.requisitionApprovalHistory.findMany({
        where: { requisitionId: id },
      });

    expect(finalHistory).toHaveLength(2);

    expect(
      finalHistory.find((row) => row.actorId === hrId)?.toStatus
    ).toBe('APPROVED');

    expect(
      finalHistory.find((row) => row.actorId === approverId)?.toStatus
    ).toBe('PENDING_APPROVAL');
  });

  it('hai yeu cau approve dong thoi chi ghi mot lich su', async () => {
    const id = await createRequisition();

    const sendApproval = () =>
      request(app)
        .post(`/api/requisitions/${id}/approve`)
        .set(authHeader(approverToken))
        .send({
          decision: 'APPROVE',
          notes: 'Concurrent approval test',
        });

    const results = await Promise.all([
      sendApproval(),
      sendApproval(),
    ]);

    const successful = results.filter((res) => res.status === 200);
    const rejected = results.filter((res) => res.status !== 200);

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect([400, 409]).toContain(rejected[0].status);

    const history =
      await prisma.requisitionApprovalHistory.findMany({
        where: { requisitionId: id },
      });

    expect(history).toHaveLength(1);

    const requisition = await prisma.requisition.findUniqueOrThrow({
      where: { id },
    });

    expect(requisition.status).toBe('APPROVED');
  });
});
