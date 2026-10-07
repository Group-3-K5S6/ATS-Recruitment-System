import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

describe('Job title salary bands', () => {
  let hrManagerToken: string;
  let recruiterToken: string;
  const applicationId = randomUUID();

  beforeAll(async () => {
    const [hrManager, recruiter] = await Promise.all([
      loginAndGetToken('hr_manager@ats.local'),
      loginAndGetToken('recruiter1@ats.local'),
    ]);
    hrManagerToken = hrManager.token;
    recruiterToken = recruiter.token;
    await prisma.application.create({
      data: {
        id: applicationId,
        candidateId: 'cand-001',
        jobId: 'job-eng-001',
      },
    });
  });

  afterAll(async () => {
    await prisma.application.deleteMany({ where: { id: applicationId } });
  });

  it('exposes salary bands only to HR managers', async () => {
    const hrResponse = await request(app)
      .get('/api/job-titles')
      .set(authHeader(hrManagerToken));
    expect(hrResponse.status).toBe(200);
    expect(hrResponse.body.data[0]).toHaveProperty('minSalary');
    expect(hrResponse.body.data[0]).toHaveProperty('maxSalary');

    const recruiterResponse = await request(app)
      .get('/api/job-titles')
      .set(authHeader(recruiterToken));
    expect(recruiterResponse.status).toBe(403);

    const optionsResponse = await request(app)
      .get('/api/job-titles/options')
      .set(authHeader(recruiterToken));
    expect(optionsResponse.status).toBe(200);
    expect(optionsResponse.body.data.length).toBeGreaterThan(0);
    expect(optionsResponse.body.data[0]).not.toHaveProperty('minSalary');
    expect(optionsResponse.body.data[0]).not.toHaveProperty('maxSalary');
  });

  it('rejects an offer outside the job title salary band', async () => {
    const response = await request(app)
      .post('/api/offers')
      .set(authHeader(recruiterToken))
      .send({ applicationId, baseSalary: 70000000 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SALARY_OUT_OF_RANGE');
    expect(response.body.error.message).not.toContain('30000000');
    expect(response.body.error.message).not.toContain('50000000');
  });
});
