import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

const TEST_YEAR = 2026;

describe('S3-04: budget headcount and final-approval override', () => {
  let hrManagerToken: string;
  let hiringManagerToken: string;
  let approverToken: string;
  let hrDepartmentId: string;
  let departmentId: string;
  let hrManagerId: string;
  let hiringManagerId: string;
  let approverId: string;
  let previousBudget: { headcount: number } | null = null;
  let previousSalaryBudget: { amountVnd: bigint } | null = null;
  const requisitionIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const overrideReason = 'Đã được Trưởng phòng Nhân sự xác nhận bổ sung chỉ tiêu.';

  beforeAll(async () => {
    const [hrManager, hiringManager, approver] = await Promise.all([
      loginAndGetToken('hr_manager@ats.local'),
      loginAndGetToken('hiring_manager_mkt@ats.local'),
      loginAndGetToken('approver@ats.local'),
    ]);

    hrManagerToken = hrManager.token;
    hiringManagerToken = hiringManager.token;
    approverToken = approver.token;
    hrManagerId = hrManager.user.id;
    hrDepartmentId = hrManager.user.departmentId;
    departmentId = hiringManager.user.departmentId;
    hiringManagerId = hiringManager.user.id;
    approverId = approver.user.id;

    previousBudget = await prisma.departmentHeadcountBudget.findUnique({
      where: { departmentId_year: { departmentId, year: TEST_YEAR } },
      select: { headcount: true },
    });
    previousSalaryBudget = await prisma.departmentSalaryBudget.findUnique({
      where: { departmentId_year: { departmentId, year: TEST_YEAR } },
      select: { amountVnd: true },
    });
    await prisma.departmentHeadcountBudget.upsert({
      where: { departmentId_year: { departmentId, year: TEST_YEAR } },
      update: { headcount: 1 },
      create: { departmentId, year: TEST_YEAR, headcount: 1 },
    });

    await prisma.requisition.createMany({
      data: requisitionIds.map((id, index) => ({
        id,
        title: `S3-04 headcount override ${index}`,
        departmentId,
        hiringManagerId,
        approverId,
        headcount: index === 0 ? 3 : 1,
        status: index === 3 ? 'APPROVED' : 'PENDING_APPROVAL',
        targetDate: new Date(Date.UTC(TEST_YEAR, 5, 1)),
        reason: 'NEW',
      })),
    });
  });

  afterAll(async () => {
    await prisma.requisitionApprovalHistory.deleteMany({
      where: { requisitionId: { in: requisitionIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { resourceId: { in: requisitionIds } },
    });
    await prisma.requisition.deleteMany({ where: { id: { in: requisitionIds } } });

    if (previousBudget) {
      await prisma.departmentHeadcountBudget.upsert({
        where: { departmentId_year: { departmentId, year: TEST_YEAR } },
        update: { headcount: previousBudget.headcount },
        create: { departmentId, year: TEST_YEAR, headcount: previousBudget.headcount },
      });
    } else {
      await prisma.departmentHeadcountBudget.deleteMany({
        where: { departmentId, year: TEST_YEAR },
      });
    }

    if (previousSalaryBudget) {
      await prisma.departmentSalaryBudget.upsert({
        where: { departmentId_year: { departmentId, year: TEST_YEAR } },
        update: { amountVnd: previousSalaryBudget.amountVnd },
        create: { departmentId, year: TEST_YEAR, amountVnd: previousSalaryBudget.amountVnd },
      });
    } else {
      await prisma.departmentSalaryBudget.deleteMany({
        where: { departmentId, year: TEST_YEAR },
      });
    }
  });

  it('stores and reloads an annual salary budget by department, while denying unauthorized roles', async () => {
    const saved = await request(app)
      .put(`/api/recruitment-budget/salary/${departmentId}`)
      .set(authHeader(hrManagerToken))
      .send({ year: TEST_YEAR, salaryBudget: '250000000' });

    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      departmentId,
      year: TEST_YEAR,
      salaryBudget: '250000000',
    });

    const listed = await request(app)
      .get(`/api/recruitment-budget/salary?year=${TEST_YEAR}`)
      .set(authHeader(hrManagerToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        department: expect.objectContaining({ id: departmentId }),
        year: TEST_YEAR,
        salaryBudget: '250000000',
      }),
    ]));

    const forbidden = await request(app)
      .put(`/api/recruitment-budget/salary/${departmentId}`)
      .set(authHeader(approverToken))
      .send({ year: TEST_YEAR, salaryBudget: '500000000' });
    expect(forbidden.status).toBe(403);
  });

  it('shows the Hiring Manager only their department remaining headcount', async () => {
    const response = await request(app)
      .get(`/api/recruitment-budget/headcount/requisition-availability?year=${TEST_YEAR}&departmentId=${departmentId}`)
      .set(authHeader(hiringManagerToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      departmentId,
      year: TEST_YEAR,
      allocatedHeadcount: 1,
      approvedHeadcount: 1,
      remainingHeadcount: 0,
    });

    const outOfScope = await request(app)
      .get(`/api/recruitment-budget/headcount/requisition-availability?year=${TEST_YEAR}&departmentId=${hrDepartmentId}`)
      .set(authHeader(hiringManagerToken));
    expect(outOfScope.status).toBe(403);
  });

  it('lets HR confirm the headcount exception without bypassing the final VP approval', async () => {
    const requisitionId = requisitionIds[0];
    const initialChain = [
      { step: 1, approverId: hrManagerId, status: 'PENDING' },
      { step: 2, approverId, status: 'WAITING' },
    ];
    await prisma.requisition.update({
      where: { id: requisitionId },
      data: { approverId: hrManagerId, approvalChain: JSON.stringify(initialChain) },
    });

    const hrApproval = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(hrManagerToken))
      .send({ decision: 'APPROVE' });
    expect(hrApproval.status).toBe(200);
    expect(hrApproval.body.data).toMatchObject({
      status: 'PENDING_APPROVAL',
      approverId,
    });

    const approvalChain = hrApproval.body.data.approvalChain as string;
    expect(JSON.parse(approvalChain)).toMatchObject([
      { step: 1, approverId: hrManagerId, status: 'APPROVED' },
      { step: 2, approverId, status: 'PENDING' },
    ]);

    const assignedVp = await prisma.requisition.findUnique({
      where: { id: requisitionId },
    });
    expect(assignedVp).toMatchObject({ approverId, approvalChain });

    const regularApprover = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(approverToken))
      .send({ decision: 'APPROVE' });

    expect(regularApprover.status).toBe(409);
    expect(regularApprover.body.error.code).toBe('HEADCOUNT_BUDGET_EXCEEDED');
    await expect(prisma.requisition.findUnique({ where: { id: requisitionId } }))
      .resolves.toMatchObject({
        status: 'PENDING_APPROVAL',
        approverId,
        approvalChain,
      });

    const missingReason = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(hrManagerToken))
      .send({ decision: 'APPROVE', headcountOverride: true, headcountOverrideReason: '   ' });
    expect(missingReason.status).toBe(400);

    const override = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(hrManagerToken))
      .send({
        decision: 'APPROVE',
        headcountOverride: true,
        headcountOverrideReason: overrideReason,
      });

    expect(override.status).toBe(200);
    expect(override.body.data.status).toBe('PENDING_APPROVAL');
    expect(override.body.data.approverId).toBe(approverId);
    expect(override.body.data.approvalChain).toBe(approvalChain);

    const confirmationHistory = await prisma.requisitionApprovalHistory.findFirst({
      where: { requisitionId, decision: 'HEADCOUNT_OVERRIDE_CONFIRMED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(confirmationHistory).toMatchObject({
      actorId: hrManagerId,
      fromStatus: 'PENDING_APPROVAL',
      toStatus: 'PENDING_APPROVAL',
      step: 2,
      notes: overrideReason,
    });

    const confirmationAudit = await prisma.auditLog.findFirst({
      where: {
        resourceId: requisitionId,
        action: 'REQUISITION_HEADCOUNT_OVERRIDE_CONFIRMED',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(assignedVp).not.toBeNull();
    expect(confirmationAudit).toMatchObject({ actorId: hrManagerId });
    expect(JSON.parse(confirmationAudit?.metadata || '{}')).toMatchObject({
      reason: overrideReason,
      year: TEST_YEAR,
      allocatedHeadcount: 1,
      approvedHeadcount: 1,
      requestedHeadcount: 3,
      approverId,
      approvalChain,
      requisitionUpdatedAt: assignedVp?.updatedAt.toISOString(),
    });

    const hrCannotApproveForVp = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(hrManagerToken))
      .send({ decision: 'APPROVE' });
    expect(hrCannotApproveForVp.status).toBe(403);
    await expect(prisma.requisition.findUnique({ where: { id: requisitionId } }))
      .resolves.toMatchObject({
        status: 'PENDING_APPROVAL',
        approverId,
      });

    const editedAt = new Date((assignedVp?.updatedAt.getTime() ?? Date.now()) + 1000);
    await prisma.requisition.update({
      where: { id: requisitionId },
      data: {
        description: 'Updated after the HR exception confirmation.',
        updatedAt: editedAt,
      },
    });
    const staleConfirmation = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(approverToken))
      .send({ decision: 'APPROVE' });
    expect(staleConfirmation.status).toBe(409);
    expect(staleConfirmation.body.error.code).toBe('HEADCOUNT_BUDGET_EXCEEDED');

    const renewedConfirmation = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(hrManagerToken))
      .send({
        decision: 'APPROVE',
        headcountOverride: true,
        headcountOverrideReason: overrideReason,
      });
    expect(renewedConfirmation.status).toBe(200);

    const finalApproval = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(approverToken))
      .send({ decision: 'APPROVE' });
    expect(finalApproval.status).toBe(200);
    expect(finalApproval.body.data.status).toBe('APPROVED');

    const history = await prisma.requisitionApprovalHistory.findFirst({
      where: { requisitionId, decision: 'APPROVE', step: 2 },
    });
    expect(history).toMatchObject({ actorId: approverId, decision: 'APPROVE' });
    expect(history?.notes).toContain(overrideReason);

    const approvalAudit = await prisma.auditLog.findFirst({
      where: { resourceId: requisitionId, action: 'REQUISITION_APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.parse(approvalAudit?.metadata || '{}').headcountOverride).toMatchObject({
      reason: overrideReason,
      confirmedBy: hrManagerId,
      year: TEST_YEAR,
      allocatedHeadcount: 1,
      approvedHeadcount: 1,
      requestedHeadcount: 3,
    });
  });

  it('does not allow an APPROVER to override the headcount limit', async () => {
    const requisitionId = requisitionIds[1];
    const response = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(approverToken))
      .send({
        decision: 'APPROVE',
        headcountOverride: true,
        headcountOverrideReason: overrideReason,
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN_SCOPE');
    await expect(
      prisma.requisition.findUnique({ where: { id: requisitionId } })
    ).resolves.toMatchObject({ status: 'PENDING_APPROVAL' });
  });

  it('allows an override only at the final approval step', async () => {
    const requisitionId = requisitionIds[1];
    await prisma.requisition.update({
      where: { id: requisitionId },
      data: {
        approverId: hrManagerId,
        approvalChain: JSON.stringify([
          { step: 1, approverId: hrManagerId, status: 'PENDING' },
          { step: 2, approverId, status: 'WAITING' },
        ]),
      },
    });

    const response = await request(app)
      .post(`/api/requisitions/${requisitionId}/approve`)
      .set(authHeader(hrManagerToken))
      .send({
        decision: 'APPROVE',
        headcountOverride: true,
        headcountOverrideReason: overrideReason,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    await expect(
      prisma.requisition.findUnique({ where: { id: requisitionId } })
    ).resolves.toMatchObject({ status: 'PENDING_APPROVAL' });
  });

  it('does not record an override when the request is within the headcount limit', async () => {
    await prisma.departmentHeadcountBudget.update({
      where: { departmentId_year: { departmentId, year: TEST_YEAR } },
      data: { headcount: 10 },
    });

    const response = await request(app)
      .post(`/api/requisitions/${requisitionIds[2]}/approve`)
      .set(authHeader(hrManagerToken))
      .send({
        decision: 'APPROVE',
        headcountOverride: true,
        headcountOverrideReason: overrideReason,
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HEADCOUNT_OVERRIDE_NOT_REQUIRED');
    await expect(
      prisma.requisition.findUnique({ where: { id: requisitionIds[2] } })
    ).resolves.toMatchObject({ status: 'PENDING_APPROVAL' });
  });
});
