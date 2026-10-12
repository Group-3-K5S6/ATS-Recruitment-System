import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { authHeader, loginAndGetToken } from './test-helper';

describe('S2-10 - Tạo yêu cầu tuyển dụng', () => {
    let token: string;
    let departmentId: string;
    let jobTitleId: string;

    beforeAll(async () => {
        const login = await loginAndGetToken('hr_manager@ats.local');
        token = login.token;
        departmentId = login.user.departmentId;

        const jobTitle = await prisma.jobTitle.create({
            data: {
                id: randomUUID(),
                code: `S210-${randomUUID().slice(0, 8)}`,
                name: 'Chức danh kiểm thử S2-10',
                level: 'Nhân viên',
                minSalary: 10000000,
                maxSalary: 30000000,
            },
        });

        jobTitleId = jobTitle.id;
    });

    afterAll(async () => {
        if (jobTitleId) {
            await prisma.jobTitle.deleteMany({
                where: { id: jobTitleId },
            });
        }
    });

    it('lưu được bản nháp khi chưa nhập đủ thông tin', async () => {
        const response = await request(app)
            .post('/api/requisitions')
            .set(authHeader(token))
            .send({
                isDraft: true,
            });

        expect(response.status).toBe(201);
        expect(response.body.data.status).toBe('DRAFT');

        await prisma.requisition.deleteMany({
            where: { id: response.body.data.id },
        });
    });

    it('từ chối ngày cần tuyển trong quá khứ', async () => {
        const response = await request(app)
            .post('/api/requisitions')
            .set(authHeader(token))
            .send({
                isDraft: true,
                departmentId,
                jobTitleId,
                targetDate: '2020-01-01T00:00:00.000Z',
            });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('từ chối khi lương tối thiểu lớn hơn lương tối đa', async () => {
        const response = await request(app)
            .post('/api/requisitions')
            .set(authHeader(token))
            .send({
                isDraft: true,
                departmentId,
                jobTitleId,
                proposedSalaryMin: 20000000,
                proposedSalaryMax: 10000000,
            });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('yêu cầu giải trình khi dải lương vượt dải chuẩn', async () => {
        const response = await request(app)
            .post('/api/requisitions')
            .set(authHeader(token))
            .send({
                isDraft: true,
                departmentId,
                jobTitleId,
                proposedSalaryMin: 10000000,
                proposedSalaryMax: 40000000,
            });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('SALARY_EXPLANATION_REQUIRED');
    });
    it('gửi yêu cầu hợp lệ để chờ phê duyệt', async () => {
        const response = await request(app)
            .post('/api/requisitions')
            .set(authHeader(token))
            .send({
                departmentId,
                jobTitleId,
                reason: 'NEW',
                headcount: 2,
                proposedSalaryMin: 10000000,
                proposedSalaryMax: 40000000,
                targetDate: '2099-12-31T00:00:00.000Z',
                description: 'Phát triển và bảo trì hệ thống backend.',
                requirements: 'Có kiến thức TypeScript và Node.js.',
                salaryExplanation: 'Mức lương tối đa cao hơn dải chuẩn để đáp ứng yêu cầu tuyển dụng.',
            });

        expect(response.status).toBe(201);
        expect(response.body.data.status).toBe('PENDING_APPROVAL');
        expect(response.body.data.reason).toBe('NEW');

        await prisma.requisition.deleteMany({
            where: { id: response.body.data.id },
        });
    });
});
