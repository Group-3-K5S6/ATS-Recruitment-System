import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

describe('S3-02: yêu cầu gửi đi được phân công người duyệt', () => {
  let hrManagerToken: string;
  let hrManagerId: string;
  let approverToken: string;
  let approverId: string;
  let configuredDepartmentId: string;
  let unconfiguredDepartmentId: string;
  let jobTitleId: string;
  const createdRequisitionIds: string[] = [];

  beforeAll(async () => {
    const hrManager = await loginAndGetToken('hr_manager@ats.local');
    const approver = await loginAndGetToken('approver@ats.local');
    hrManagerToken = hrManager.token;
    hrManagerId = hrManager.user.id;
    approverToken = approver.token;
    approverId = approver.user.id;

    const configuredDepartment = await prisma.department.create({
      data: {
        name: 'S3-02 Configured Department',
        code: `S302-C-${randomUUID().slice(0, 8)}`,
      },
    });
    configuredDepartmentId = configuredDepartment.id;

    const unconfiguredDepartment = await prisma.department.create({
      data: {
        name: 'S3-02 Department Without Workflow',
        code: `S302-U-${randomUUID().slice(0, 8)}`,
      },
    });
    unconfiguredDepartmentId = unconfiguredDepartment.id;

    const jobTitle = await prisma.jobTitle.create({
      data: {
        code: `S302-${randomUUID().slice(0, 8)}`,
        name: 'S3-02 Test Position',
        level: 'Senior',
        minSalary: 10_000_000,
        maxSalary: 30_000_000,
      },
    });
    jobTitleId = jobTitle.id;

    await prisma.approvalWorkflow.create({
      data: {
        departmentId: configuredDepartmentId,
        version: 1,
        ranges: {
          create: [{
            minSalary: 0,
            maxSalary: null,
            orderIndex: 0,
            approverIds: JSON.stringify([approverId]),
          }],
        },
      },
    });
  });

  afterAll(async () => {
    if (createdRequisitionIds.length > 0) {
      await prisma.requisitionApprovalHistory.deleteMany({
        where: { requisitionId: { in: createdRequisitionIds } },
      });
      await prisma.requisition.deleteMany({
        where: { id: { in: createdRequisitionIds } },
      });
    }

    if (configuredDepartmentId && unconfiguredDepartmentId) {
      const departmentIds = [configuredDepartmentId, unconfiguredDepartmentId];
      await prisma.approvalWorkflow.deleteMany({
        where: { departmentId: { in: departmentIds } },
      });
      await prisma.department.deleteMany({
        where: { id: { in: departmentIds } },
      });
    }

    if (jobTitleId) {
      await prisma.jobTitle.deleteMany({ where: { id: jobTitleId } });
    }
  });

  function submission(departmentId: string, title: string) {
    return {
      departmentId,
      jobTitleId,
      title,
      reason: 'NEW',
      headcount: 1,
      proposedSalaryMin: 10_000_000,
      proposedSalaryMax: 20_000_000,
      targetDate: '2099-12-31T00:00:00.000Z',
      description: 'S3-02 routing test description.',
      requirements: 'S3-02 routing test requirements.',
    };
  }

  it('không lưu yêu cầu chờ duyệt nếu phòng ban chưa có workflow', async () => {
    const title = `S3-02 missing workflow ${randomUUID()}`;
    const response = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hrManagerToken))
      .send(submission(unconfiguredDepartmentId, title));

    if (response.body.data?.id) {
      createdRequisitionIds.push(response.body.data.id);
    }

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_ACTIVE_APPROVER');
    await expect(
      prisma.requisition.findFirst({ where: { title } })
    ).resolves.toBeNull();
  });

  it('không chấp nhận người được chỉ định thủ công nếu họ không có vai trò APPROVER', async () => {
    const title = `S3-02 invalid approver ${randomUUID()}`;
    const response = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hrManagerToken))
      .send({
        ...submission(unconfiguredDepartmentId, title),
        approverId: hrManagerId,
      });

    if (response.body.data?.id) {
      createdRequisitionIds.push(response.body.data.id);
    }

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_ACTIVE_APPROVER');
    await expect(
      prisma.requisition.findFirst({ where: { title } })
    ).resolves.toBeNull();
  });

  it('gán approver theo workflow và hiện yêu cầu trong danh sách chờ duyệt', async () => {
    const response = await request(app)
      .post('/api/requisitions')
      .set(authHeader(hrManagerToken))
      .send(submission(configuredDepartmentId, `S3-02 assigned ${randomUUID()}`));

    if (response.body.data?.id) {
      createdRequisitionIds.push(response.body.data.id);
    }

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('PENDING_APPROVAL');
    expect(response.body.data.approverId).toBe(approverId);
    expect(JSON.parse(response.body.data.approvalChain)[0].approverId).toBe(approverId);

    const [approverList, hrManagerList] = await Promise.all([
      request(app).get('/api/requisitions').set(authHeader(approverToken)),
      request(app).get('/api/requisitions').set(authHeader(hrManagerToken)),
    ]);

    expect(approverList.status).toBe(200);
    expect(approverList.body.data.map((item: { id: string }) => item.id))
      .toContain(response.body.data.id);
    expect(hrManagerList.status).toBe(200);
    expect(hrManagerList.body.data.map((item: { id: string }) => item.id))
      .toContain(response.body.data.id);
  });
});
