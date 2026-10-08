import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

describe('S2-05 - Chức danh và dải lương', () => {
  let hrManagerToken: string;
  let recruiterToken: string;

  const jobTitleId = randomUUID();

  let jobId = '';
  let applicationId = '';
  let previousJobTitleId: string | null = null;
  let createdApplication = false;

  beforeAll(async () => {
    const [hrManager, recruiter] = await Promise.all([
      loginAndGetToken('hr_manager@ats.local'),
      loginAndGetToken('recruiter1@ats.local'),
    ]);

    hrManagerToken = hrManager.token;
    recruiterToken = recruiter.token;

    const job = await prisma.job.findFirst({
      select: {
        id: true,
        jobTitleId: true,
      },
    });

    const candidate = await prisma.candidate.findFirst({
      select: {
        id: true,
      },
    });

    if (!job) {
      throw new Error('Không có tin tuyển dụng để kiểm thử S2-05.');
    }

    if (!candidate) {
      throw new Error('Không có ứng viên để kiểm thử S2-05.');
    }

    jobId = job.id;
    previousJobTitleId = job.jobTitleId ?? null;

    await prisma.jobTitle.create({
      data: {
        id: jobTitleId,
        code: `S205-${randomUUID().slice(0, 8)}`,
        name: 'Chức danh kiểm thử S2-05',
        level: 'Nhân viên',
        minSalary: 30000000,
        maxSalary: 50000000,
      },
    });

    await prisma.job.update({
      where: {
        id: jobId,
      },
      data: {
        jobTitleId,
      },
    });

    const existingApplication = await prisma.application.findFirst({
      where: {
        jobId,
        candidateId: candidate.id,
      },
      select: {
        id: true,
      },
    });

    if (existingApplication) {
      applicationId = existingApplication.id;
    } else {
      applicationId = randomUUID();

      await prisma.application.create({
        data: {
          id: applicationId,
          candidateId: candidate.id,
          jobId,
        },
      });

      createdApplication = true;
    }
  });

  afterAll(async () => {
    if (createdApplication && applicationId) {
      await prisma.application.deleteMany({
        where: {
          id: applicationId,
        },
      });
    }

    if (jobId) {
      await prisma.job.update({
        where: {
          id: jobId,
        },
        data: {
          jobTitleId: previousJobTitleId,
        },
      });
    }

    await prisma.jobTitle.deleteMany({
      where: {
        id: jobTitleId,
      },
    });
  });

  it('chỉ HR Manager được xem đầy đủ dải lương', async () => {
    const hrResponse = await request(app)
      .get('/api/job-titles')
      .set(authHeader(hrManagerToken));

    expect(hrResponse.status).toBe(200);

    const jobTitle = hrResponse.body.data.find(
      (item: { id: string }) => item.id === jobTitleId,
    );

    expect(jobTitle).toBeDefined();
    expect(jobTitle).toHaveProperty('minSalary', 30000000);
    expect(jobTitle).toHaveProperty('maxSalary', 50000000);

    const recruiterResponse = await request(app)
      .get('/api/job-titles')
      .set(authHeader(recruiterToken));

    expect(recruiterResponse.status).toBe(403);
  });

  it('danh sách lựa chọn chức danh không làm lộ dải lương', async () => {
    const response = await request(app)
      .get('/api/job-titles/options')
      .set(authHeader(recruiterToken));

    expect(response.status).toBe(200);

    const jobTitle = response.body.data.find(
      (item: { id: string }) => item.id === jobTitleId,
    );

    expect(jobTitle).toBeDefined();
    expect(jobTitle).not.toHaveProperty('minSalary');
    expect(jobTitle).not.toHaveProperty('maxSalary');
  });

  it('từ chối Offer có mức lương nằm ngoài dải cho phép', async () => {
    const response = await request(app)
      .post('/api/offers')
      .set(authHeader(recruiterToken))
      .send({
        applicationId,
        baseSalary: 70000000,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SALARY_OUT_OF_RANGE');

    // Không làm lộ mức lương nội bộ trong thông báo lỗi.
    expect(response.body.error.message).not.toContain('30000000');
    expect(response.body.error.message).not.toContain('50000000');
  });
});