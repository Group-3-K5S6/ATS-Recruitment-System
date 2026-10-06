import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAndGetToken, authHeader } from './test-helper';
import { prisma } from '../src/database/prisma';

describe('[BE] S2-06 - Competency Framework Management & Authorization', () => {
  let hrManagerToken: string;
  let adminToken: string;
  let recruiterToken: string;
  let interviewerToken: string;
  let candidateToken: string;
  let hiringManagerToken: string;

  let existingJob1Id: string;
  let existingJob2Id: string;
  let createdFrameworkId: string;
  let createdCriterionId: string;

  beforeAll(async () => {
    // 1. Authenticate users with different roles
    hrManagerToken = (await loginAndGetToken('hr_manager@ats.local')).token;
    adminToken = (await loginAndGetToken('admin@ats.local')).token;
    recruiterToken = (await loginAndGetToken('recruiter1@ats.local')).token;
    interviewerToken = (await loginAndGetToken('interviewer1@ats.local')).token;
    candidateToken = (await loginAndGetToken('candidate1@ats.local')).token;
    hiringManagerToken = (await loginAndGetToken('hiring_manager_eng@ats.local')).token;

    // 2. Fetch existing jobs for testing job mapping
    const jobs = await prisma.job.findMany({ take: 2 });
    if (jobs.length < 2) {
      throw new Error('At least 2 jobs must be present in database from seed.');
    }
    existingJob1Id = jobs[0].id;
    existingJob2Id = jobs[1].id;
  });

  describe('1. Framework Creation & Business Rules (HR Manager)', () => {
    it('1. HR Manager creates framework successfully with total weight = 100%', async () => {
      const payload = {
        name: 'Khung năng lực Frontend Engineer',
        description: 'Bộ tiêu chí đánh giá chuẩn cho Frontend React/Vue',
        jobIds: [existingJob1Id],
        criteria: [
          {
            name: 'React & UI Architecture',
            description: 'Thành thạo React, State Management và tối ưu bundle',
            weight: 40,
          },
          {
            name: 'JavaScript & CSS / Responsive Design',
            description: 'Nắm vững JS Core, CSS3 và HTML5 semantic',
            weight: 30,
          },
          {
            name: 'Problem Solving & Testing',
            description: 'Tư duy thuật toán và unit test',
            weight: 30,
          },
        ],
      };

      const res = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(hrManagerToken))
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data.totalWeight).toBe(100);
      expect(res.body.data.criteria.length).toBe(3);
      expect(res.body.data.jobs.length).toBe(1);
      expect(res.body.data.jobs[0].id).toBe(existingJob1Id);

      createdFrameworkId = res.body.data.id;
      createdCriterionId = res.body.data.criteria[0].id;
    });

    it('2. Rejects framework creation if total weight != 100% (Sum = 80%)', async () => {
      const payload = {
        name: 'Invalid Weight Framework',
        criteria: [
          { name: 'Skill A', weight: 50 },
          { name: 'Skill B', weight: 30 },
        ],
      };

      const res = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(hrManagerToken))
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Total criteria weight must equal 100%');
    });

    it('3. Rejects framework creation without any criteria', async () => {
      const payload = {
        name: 'Empty Criteria Framework',
        criteria: [],
      };

      const res = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(hrManagerToken))
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Framework must contain at least one criterion');
    });

    it('4. Rejects criterion with weight <= 0', async () => {
      const payload = {
        name: 'Zero Weight Framework',
        criteria: [
          { name: 'Valid Skill', weight: 100 },
          { name: 'Zero Skill', weight: 0 },
        ],
      };

      const res = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(hrManagerToken))
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Weight must be greater than 0');
    });

    it('5. Rejects criterion with weight > 100', async () => {
      const payload = {
        name: 'Overweight Framework',
        criteria: [{ name: 'Excessive Skill', weight: 105 }],
      };

      const res = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(hrManagerToken))
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('6. Rejects framework with duplicate criterion names (Rule 5)', async () => {
      const payload = {
        name: 'Duplicate Names Framework',
        criteria: [
          { name: 'Technical Skill', weight: 50 },
          { name: 'technical skill', weight: 50 }, // case-insensitive duplicate
        ],
      };

      const res = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(hrManagerToken))
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Duplicate criterion name');
    });
  });

  describe('2. Framework Retrieval & Querying', () => {
    it('7. HR Manager lists frameworks with criteria and job counts', async () => {
      const res = await request(app)
        .get('/api/competency-frameworks')
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      const found = res.body.data.find((f: any) => f.id === createdFrameworkId);
      expect(found).toBeDefined();
      expect(found.totalWeight).toBe(100);
    });

    it('8. Retrieves detailed framework by ID with total weight and assigned jobs', async () => {
      const res = await request(app)
        .get(`/api/competency-frameworks/${createdFrameworkId}`)
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdFrameworkId);
      expect(res.body.data.criteria.length).toBe(3);
      expect(res.body.data.totalWeight).toBe(100);
      expect(res.body.data.jobs).toBeDefined();
      expect(res.body.data.jobs.some((j: any) => j.id === existingJob1Id)).toBe(true);
    });

    it('9. Returns 404 for non-existent framework ID', async () => {
      const res = await request(app)
        .get('/api/competency-frameworks/00000000-0000-0000-0000-000000000000')
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('3. Framework Update & N:N Job Mapping', () => {
    it('10. Updates framework metadata and rebalances criteria atomically', async () => {
      const updatePayload = {
        name: 'Khung năng lực Frontend Engineer (Updated)',
        description: 'Mô tả đã được cập nhật',
        criteria: [
          {
            id: createdCriterionId,
            name: 'React & Modern Frontend Architecture',
            weight: 50,
          },
          {
            name: 'UI/UX & CSS Mastery',
            weight: 30,
          },
          {
            name: 'Testing & Code Quality',
            weight: 20,
          },
        ],
      };

      const res = await request(app)
        .put(`/api/competency-frameworks/${createdFrameworkId}`)
        .set(authHeader(hrManagerToken))
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(updatePayload.name);
      expect(res.body.data.totalWeight).toBe(100);
      expect(res.body.data.criteria.length).toBe(3);
    });

    it('11. Rejects framework update if new criteria total weight != 100%', async () => {
      const updatePayload = {
        criteria: [
          { name: 'Skill X', weight: 40 },
          { name: 'Skill Y', weight: 40 },
        ],
      };

      const res = await request(app)
        .put(`/api/competency-frameworks/${createdFrameworkId}`)
        .set(authHeader(hrManagerToken))
        .send(updatePayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Total criteria weight must equal 100%');
    });

    it('12. Assigns framework to multiple positions/jobs (N:N relationship without duplicate framework data)', async () => {
      // Assign job 2 in addition to job 1
      const res = await request(app)
        .post(`/api/competency-frameworks/${createdFrameworkId}/jobs`)
        .set(authHeader(hrManagerToken))
        .send({ jobIds: [existingJob2Id] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs.length).toBe(2);

      // Verify N:N relationship in database
      const mappings = await prisma.jobCompetencyFramework.findMany({
        where: { frameworkId: createdFrameworkId },
      });
      expect(mappings.length).toBe(2);
    });

    it('13. Removes a job assignment from framework', async () => {
      const res = await request(app)
        .delete(`/api/competency-frameworks/${createdFrameworkId}/jobs/${existingJob2Id}`)
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs.length).toBe(1);
    });
  });

  describe('4. Individual Criteria Management & Scoping', () => {
    let testFrameworkId: string;
    let crit1Id: string;
    let crit2Id: string;

    beforeAll(async () => {
      // Create a dedicated test framework with 2 criteria: 60% and 40%
      const createRes = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(hrManagerToken))
        .send({
          name: 'Individual Criteria Test Framework',
          criteria: [
            { name: 'Crit A', weight: 60 },
            { name: 'Crit B', weight: 40 },
          ],
        });
      testFrameworkId = createRes.body.data.id;
      crit1Id = createRes.body.data.criteria[0].id;
      crit2Id = createRes.body.data.criteria[1].id;
    });

    it('14. Cannot update criterion belonging to a different framework (Scoping check)', async () => {
      // Attempt to update crit1Id using another framework ID
      const res = await request(app)
        .put(`/api/competency-frameworks/${createdFrameworkId}/criteria/${crit1Id}`)
        .set(authHeader(hrManagerToken))
        .send({ name: 'Cross Framework Tampering', weight: 50 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CRITERION_NOT_FOUND');
    });

    it('15. Updates single criterion weight when maintaining 100% total', async () => {
      // Update crit1 to 70% (would make sum 70 + 40 = 110%) -> should reject
      const failRes = await request(app)
        .put(`/api/competency-frameworks/${testFrameworkId}/criteria/${crit1Id}`)
        .set(authHeader(hrManagerToken))
        .send({ weight: 70 });

      expect(failRes.status).toBe(400);
      expect(failRes.body.error.code).toBe('INVALID_WEIGHT_SUM');

      // Update crit1 name only -> should succeed
      const successRes = await request(app)
        .put(`/api/competency-frameworks/${testFrameworkId}/criteria/${crit1Id}`)
        .set(authHeader(hrManagerToken))
        .send({ name: 'Crit A - Renamed' });

      expect(successRes.status).toBe(200);
      expect(successRes.body.data.criteria.find((c: any) => c.id === crit1Id).name).toBe('Crit A - Renamed');
    });

    it('16. Rejects deleting criterion if remaining total weight != 100%', async () => {
      const res = await request(app)
        .delete(`/api/competency-frameworks/${testFrameworkId}/criteria/${crit2Id}`)
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_WEIGHT_SUM');
    });
  });

  describe('5. RBAC & Access Control Enforcement', () => {
    it('17. CANDIDATE cannot read competency frameworks -> 403', async () => {
      const res = await request(app)
        .get('/api/competency-frameworks')
        .set(authHeader(candidateToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('18. CANDIDATE cannot create competency framework -> 403', async () => {
      const res = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(candidateToken))
        .send({
          name: 'Unauthorized Candidate Framework',
          criteria: [{ name: 'Cheating', weight: 100 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('19. CANDIDATE cannot update competency framework -> 403', async () => {
      const res = await request(app)
        .put(`/api/competency-frameworks/${createdFrameworkId}`)
        .set(authHeader(candidateToken))
        .send({ name: 'Candidate Update Attempt' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('20. CANDIDATE cannot delete competency framework -> 403', async () => {
      const res = await request(app)
        .delete(`/api/competency-frameworks/${createdFrameworkId}`)
        .set(authHeader(candidateToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('21. RECRUITER can read frameworks but cannot create/update/delete -> 403 on create', async () => {
      // Read: allowed
      const readRes = await request(app)
        .get('/api/competency-frameworks')
        .set(authHeader(recruiterToken));
      expect(readRes.status).toBe(200);

      // Create: forbidden
      const createRes = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(recruiterToken))
        .send({
          name: 'Recruiter Framework',
          criteria: [{ name: 'Skill', weight: 100 }],
        });
      expect(createRes.status).toBe(403);
    });

    it('22. INTERVIEWER can read frameworks for upcoming Sprint 6 evaluation -> 200', async () => {
      const res = await request(app)
        .get('/api/competency-frameworks')
        .set(authHeader(interviewerToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('23. Sprint 6 Readiness: Can retrieve criteria for a specific job', async () => {
      const res = await request(app)
        .get(`/api/competency-frameworks/jobs/${existingJob1Id}`)
        .set(authHeader(interviewerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBe(existingJob1Id);
      expect(Array.isArray(res.body.data.criteria)).toBe(true);
    });

    it('24. Unauthenticated request rejected -> 401', async () => {
      const res = await request(app).get('/api/competency-frameworks');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('6. Framework Deletion & Deactivation (Soft Delete / Historical Protection)', () => {
    it('25. Framework associated with a job is deactivated (soft delete) instead of hard delete', async () => {
      // createdFrameworkId is associated with existingJob1Id
      const res = await request(app)
        .delete(`/api/competency-frameworks/${createdFrameworkId}`)
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deactivated).toBe(true);

      // Verify isActive is now false
      const check = await prisma.competencyFramework.findUnique({
        where: { id: createdFrameworkId },
      });
      expect(check?.isActive).toBe(false);
    });

    it('26. Reject permanent hard delete if framework is in use by jobs', async () => {
      const res = await request(app)
        .delete(`/api/competency-frameworks/${createdFrameworkId}?permanent=true`)
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FRAMEWORK_IN_USE');
    });

    it('27. Permanent delete succeeds on an unused framework', async () => {
      // Create unused framework
      const createRes = await request(app)
        .post('/api/competency-frameworks')
        .set(authHeader(hrManagerToken))
        .send({
          name: 'Disposable Framework',
          criteria: [{ name: 'Solo Skill', weight: 100 }],
        });

      const tempId = createRes.body.data.id;

      const deleteRes = await request(app)
        .delete(`/api/competency-frameworks/${tempId}?permanent=true`)
        .set(authHeader(hrManagerToken));

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.deleted).toBe(true);

      const check = await prisma.competencyFramework.findUnique({
        where: { id: tempId },
      });
      expect(check).toBeNull();
    });
  });
});
