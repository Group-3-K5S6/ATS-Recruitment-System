import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAndGetToken, authHeader } from './test-helper';
import { prisma } from '../src/database/prisma';

describe('[BE] S2-07 - Interview Question Bank Management & Authorization', () => {
  let hrManagerToken: string;
  let adminToken: string;
  let interviewerToken: string;
  let hiringManagerToken: string;
  let candidateToken: string;
  let approverToken: string;

  let frameworkId: string;
  let criterion1Id: string;
  let criterion2Id: string;

  let createdQuestion1Id: string;
  let createdQuestion2Id: string;

  beforeAll(async () => {
    // 1. Authenticate various roles
    hrManagerToken = (await loginAndGetToken('hr_manager@ats.local')).token;
    adminToken = (await loginAndGetToken('admin@ats.local')).token;
    interviewerToken = (await loginAndGetToken('interviewer1@ats.local')).token;
    hiringManagerToken = (await loginAndGetToken('hiring_manager_eng@ats.local')).token;
    candidateToken = (await loginAndGetToken('candidate1@ats.local')).token;
    approverToken = (await loginAndGetToken('approver@ats.local')).token;

    // 2. Setup a test competency framework and criteria
    const framework = await prisma.competencyFramework.create({
      data: {
        name: 'Khung Năng Lực Backend Test S2-07',
        description: 'Dành riêng cho kiểm thử ngân hàng câu hỏi',
        isActive: true,
        criteria: {
          create: [
            {
              name: 'Node.js & Express Architecture',
              description: 'Nắm vững event loop, middleware, streaming',
              weight: 60,
            },
            {
              name: 'Database Optimization & SQL',
              description: 'Indexing, query optimization, transactions',
              weight: 40,
            },
          ],
        },
      },
      include: { criteria: true },
    });

    frameworkId = framework.id;
    criterion1Id = framework.criteria[0].id;
    criterion2Id = framework.criteria[1].id;
  });

  describe('1. CRUD Operations (HR Manager & Admin)', () => {
    it('1.1. HR Manager creates interview question successfully', async () => {
      const payload = {
        question: 'Giải thích cơ chế Event Loop trong Node.js và các phase chính?',
        difficulty: 'HARD',
        suggestedAnswer:
          'Ứng viên cần nêu được libuv, call stack, microtask queue (process.nextTick, Promise), và các phase: timers, pending callbacks, idle/prepare, poll, check, close callbacks.',
        competencyCriterionId: criterion1Id,
      };

      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(hrManagerToken))
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.question).toBe(payload.question);
      expect(res.body.data.difficulty).toBe('HARD');
      expect(res.body.data.suggestedAnswer).toBe(payload.suggestedAnswer);
      expect(res.body.data.competencyCriterionId).toBe(criterion1Id);
      expect(res.body.data.criterion).toBeDefined();
      expect(res.body.data.criterion.name).toBe('Node.js & Express Architecture');
      expect(res.body.data.criterion.framework.id).toBe(frameworkId);

      createdQuestion1Id = res.body.data.id;
    });

    it('1.2. Admin creates another interview question with medium difficulty', async () => {
      const payload = {
        question: 'Index trong RDBMS hoạt động như thế nào? Khi nào không nên đánh index?',
        difficulty: 'MEDIUM',
        suggestedAnswer:
          'Dựa trên cấu trúc B-Tree hoặc Hash. Không nên đánh index trên bảng nhỏ, cột có cardinality thấp hoặc bảng có tần suất ghi/insert/update cực cao.',
        competencyCriterionId: criterion2Id,
      };

      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(adminToken))
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.difficulty).toBe('MEDIUM');
      expect(res.body.data.competencyCriterionId).toBe(criterion2Id);

      createdQuestion2Id = res.body.data.id;
    });

    it('1.3. Get question details by ID', async () => {
      const res = await request(app)
        .get(`/api/interview-questions/${createdQuestion1Id}`)
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdQuestion1Id);
      expect(res.body.data.question).toContain('Event Loop');
      expect(res.body.data.criterion.id).toBe(criterion1Id);
    });

    it('1.4. Update question details successfully', async () => {
      const updatePayload = {
        question: 'Giải thích chi tiết cơ chế Event Loop trong Node.js (cập nhật)?',
        difficulty: 'MEDIUM',
        suggestedAnswer: 'Gợi ý câu trả lời bổ sung phần Worker Threads.',
      };

      const res = await request(app)
        .put(`/api/interview-questions/${createdQuestion1Id}`)
        .set(authHeader(hrManagerToken))
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.question).toBe(updatePayload.question);
      expect(res.body.data.difficulty).toBe('MEDIUM');
      expect(res.body.data.suggestedAnswer).toBe(updatePayload.suggestedAnswer);
    });

    it('1.5. Returns 404 when getting non-existent question ID', async () => {
      const res = await request(app)
        .get('/api/interview-questions/non-existent-uuid-123')
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('1.6. Delete question successfully', async () => {
      // Create a temporary question to delete
      const tempRes = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(hrManagerToken))
        .send({
          question: 'Temporary Question to be deleted',
          difficulty: 'EASY',
          suggestedAnswer: 'Temp Answer',
          competencyCriterionId: criterion1Id,
        });

      const tempId = tempRes.body.data.id;

      const deleteRes = await request(app)
        .delete(`/api/interview-questions/${tempId}`)
        .set(authHeader(hrManagerToken));

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Verify it is gone
      const verifyRes = await request(app)
        .get(`/api/interview-questions/${tempId}`)
        .set(authHeader(hrManagerToken));

      expect(verifyRes.status).toBe(404);
    });
  });

  describe('2. Validation & Input Sanitation', () => {
    it('2.1. Rejects creation when question/content is empty', async () => {
      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(hrManagerToken))
        .send({
          question: '   ',
          difficulty: 'EASY',
          suggestedAnswer: 'Some answer',
          competencyCriterionId: criterion1Id,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('2.2. Rejects creation when suggestedAnswer is empty', async () => {
      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(hrManagerToken))
        .send({
          question: 'Valid question text?',
          difficulty: 'EASY',
          suggestedAnswer: '   ',
          competencyCriterionId: criterion1Id,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Suggested answer cannot be empty');
    });

    it('2.3. Accepts `content` field as alias for `question`', async () => {
      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(hrManagerToken))
        .send({
          content: 'Khái niệm Sharding trong CSDL phân tán?',
          difficulty: 'HARD',
          suggestedAnswer: 'Phân vùng dữ liệu theo chiều ngang ngang giữa nhiều máy chủ DB.',
          competencyCriterionId: criterion2Id,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.question).toBe('Khái niệm Sharding trong CSDL phân tán?');
    });

    it('2.4. Trims leading and trailing whitespace from input', async () => {
      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(hrManagerToken))
        .send({
          question: '   Đặc điểm của RESTful API là gì?   ',
          difficulty: 'EASY',
          suggestedAnswer: '   Stateless, Client-Server, Cacheable.   ',
          competencyCriterionId: criterion1Id,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.question).toBe('Đặc điểm của RESTful API là gì?');
      expect(res.body.data.suggestedAnswer).toBe('Stateless, Client-Server, Cacheable.');
    });
  });

  describe('3. Search and Filtering', () => {
    it('3.1. Searches questions by keyword in question text', async () => {
      const res = await request(app)
        .get('/api/interview-questions?search=Event Loop')
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((q: any) => q.question.includes('Event Loop'))).toBe(true);
    });

    it('3.2. Searches questions by keyword in suggestedAnswer', async () => {
      const res = await request(app)
        .get('/api/interview-questions?search=cardinality')
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((q: any) => q.suggestedAnswer.includes('cardinality'))).toBe(true);
    });

    it('3.3. Filters questions by difficulty (EASY, MEDIUM, HARD)', async () => {
      const hardRes = await request(app)
        .get('/api/interview-questions?difficulty=HARD')
        .set(authHeader(hrManagerToken));

      expect(hardRes.status).toBe(200);
      expect(hardRes.body.data.every((q: any) => q.difficulty === 'HARD')).toBe(true);

      const medRes = await request(app)
        .get('/api/interview-questions?difficulty=MEDIUM')
        .set(authHeader(hrManagerToken));

      expect(medRes.status).toBe(200);
      expect(medRes.body.data.every((q: any) => q.difficulty === 'MEDIUM')).toBe(true);
    });
  });

  describe('4. Framework & Criterion Filtering', () => {
    it('4.1. Filters questions by competencyCriterionId', async () => {
      const res = await request(app)
        .get(`/api/interview-questions?competencyCriterionId=${criterion2Id}`)
        .set(authHeader(interviewerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(
        res.body.data.every((q: any) => q.competencyCriterionId === criterion2Id)
      ).toBe(true);
    });

    it('4.2. Filters questions by competencyFrameworkId', async () => {
      const res = await request(app)
        .get(`/api/interview-questions?competencyFrameworkId=${frameworkId}`)
        .set(authHeader(interviewerToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(
        res.body.data.every(
          (q: any) => q.criterion && q.criterion.frameworkId === frameworkId
        )
      ).toBe(true);
    });

    it('4.3. Combines competencyFrameworkId and difficulty filters', async () => {
      const res = await request(app)
        .get(
          `/api/interview-questions?competencyFrameworkId=${frameworkId}&difficulty=HARD`
        )
        .set(authHeader(hiringManagerToken));

      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (q: any) =>
            q.difficulty === 'HARD' && q.criterion.frameworkId === frameworkId
        )
      ).toBe(true);
    });
  });

  describe('5. Handling Invalid Criterion & Framework', () => {
    it('5.1. Rejects creation with non-existent competencyCriterionId', async () => {
      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(hrManagerToken))
        .send({
          question: 'Valid question?',
          difficulty: 'EASY',
          suggestedAnswer: 'Valid answer',
          competencyCriterionId: 'non-existent-criterion-id',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Competency criterion not found');
    });

    it('5.2. Rejects update with non-existent competencyCriterionId', async () => {
      const res = await request(app)
        .put(`/api/interview-questions/${createdQuestion1Id}`)
        .set(authHeader(hrManagerToken))
        .send({
          competencyCriterionId: 'non-existent-criterion-id',
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Competency criterion not found');
    });

    it('5.3. Returns 404 when filtering by non-existent framework ID', async () => {
      const res = await request(app)
        .get('/api/interview-questions?competencyFrameworkId=fake-framework-uuid')
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Competency framework not found');
    });

    it('5.4. Returns 404 when filtering by non-existent criterion ID', async () => {
      const res = await request(app)
        .get('/api/interview-questions?competencyCriterionId=fake-criterion-uuid')
        .set(authHeader(hrManagerToken));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Competency criterion not found');
    });
  });

  describe('6. Invalid Difficulty Validation', () => {
    it('6.1. Rejects question creation with invalid difficulty string', async () => {
      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(hrManagerToken))
        .send({
          question: 'Valid question?',
          difficulty: 'EXTREME_HARD',
          suggestedAnswer: 'Valid answer',
          competencyCriterionId: criterion1Id,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('EASY, MEDIUM, HARD');
    });

    it('6.2. Rejects question update with invalid difficulty string', async () => {
      const res = await request(app)
        .put(`/api/interview-questions/${createdQuestion1Id}`)
        .set(authHeader(hrManagerToken))
        .send({
          difficulty: 'SUPER_EASY',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('7. Server-side Authentication Guard', () => {
    it('7.1. Denies GET /api/interview-questions without auth token (401)', async () => {
      const res = await request(app).get('/api/interview-questions');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('7.2. Denies POST /api/interview-questions without auth token (401)', async () => {
      const res = await request(app)
        .post('/api/interview-questions')
        .send({
          question: 'Unauthenticated attempt?',
          difficulty: 'EASY',
          suggestedAnswer: 'None',
          competencyCriterionId: criterion1Id,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('7.3. Denies request with malformed or fake token (401)', async () => {
      const res = await request(app)
        .get('/api/interview-questions')
        .set({ Authorization: 'Bearer fake-invalid-jwt-token' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('8. Server-side Authorization & RBAC Matrix', () => {
    it('8.1. Interviewer CAN view interview questions (GET 200)', async () => {
      const res = await request(app)
        .get('/api/interview-questions')
        .set(authHeader(interviewerToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('8.2. Interviewer CANNOT create an interview question (POST 403)', async () => {
      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(interviewerToken))
        .send({
          question: 'Interviewer unauthorized create attempt',
          difficulty: 'MEDIUM',
          suggestedAnswer: 'Should fail',
          competencyCriterionId: criterion1Id,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('8.3. Candidate CANNOT view interview questions (GET 403)', async () => {
      const res = await request(app)
        .get('/api/interview-questions')
        .set(authHeader(candidateToken));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('8.4. Candidate CANNOT create interview questions (POST 403)', async () => {
      const res = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(candidateToken))
        .send({
          question: 'Candidate leak attempt',
          difficulty: 'EASY',
          suggestedAnswer: 'Cheat',
          competencyCriterionId: criterion1Id,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('8.5. Approver CANNOT view interview questions (GET 403)', async () => {
      const res = await request(app)
        .get('/api/interview-questions')
        .set(authHeader(approverToken));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });
  });

  describe('9. IDOR & Anti-Tampering Security', () => {
    it('9.1. Non-manager (Interviewer) CANNOT update question (PUT 403)', async () => {
      const res = await request(app)
        .put(`/api/interview-questions/${createdQuestion1Id}`)
        .set(authHeader(interviewerToken))
        .send({
          question: 'Tampered question text',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('9.2. Non-manager (Interviewer) CANNOT delete question (DELETE 403)', async () => {
      const res = await request(app)
        .delete(`/api/interview-questions/${createdQuestion1Id}`)
        .set(authHeader(interviewerToken));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });

    it('9.3. Candidate CANNOT tamper with non-existent question (denied with 403 before leaking 404)', async () => {
      const res = await request(app)
        .put('/api/interview-questions/random-question-id')
        .set(authHeader(candidateToken))
        .send({
          question: 'Exploit test',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('10. Data Integrity, Cascade & Audit Logging', () => {
    it('10.1. Cascade deletes questions when parent criterion is deleted (no orphan data)', async () => {
      // 1. Create a dedicated framework and criterion with a question
      const dedicatedFramework = await prisma.competencyFramework.create({
        data: {
          name: 'Cascade Framework Test',
          criteria: {
            create: [
              {
                name: 'Cascade Target Criterion',
                weight: 100,
              },
            ],
          },
        },
        include: { criteria: true },
      });

      const dedicatedCriterionId = dedicatedFramework.criteria[0].id;

      // 2. Create question tied to this criterion
      const qRes = await request(app)
        .post('/api/interview-questions')
        .set(authHeader(hrManagerToken))
        .send({
          question: 'Will this question cascade delete properly?',
          difficulty: 'EASY',
          suggestedAnswer: 'Yes, because Prisma relation has onDelete: Cascade.',
          competencyCriterionId: dedicatedCriterionId,
        });

      expect(qRes.status).toBe(201);
      const questionId = qRes.body.data.id;

      // 3. Delete criterion via database or framework cascade
      await prisma.competencyCriterion.delete({
        where: { id: dedicatedCriterionId },
      });

      // 4. Verify question was also deleted (no orphan records)
      const checkQuestion = await prisma.interviewQuestion.findUnique({
        where: { id: questionId },
      });

      expect(checkQuestion).toBeNull();

      // Clean up framework
      await prisma.competencyFramework.delete({
        where: { id: dedicatedFramework.id },
      });
    });

    it('10.2. Verifies audit logs are generated for question CRUD operations', async () => {
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          resourceType: 'interview_question',
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      const actions = auditLogs.map((log) => log.action);
      expect(
        actions.includes('INTERVIEW_QUESTION_CREATED') ||
        actions.includes('INTERVIEW_QUESTION_UPDATED') ||
        actions.includes('INTERVIEW_QUESTION_DELETED')
      ).toBe(true);
    });
  });
});
