"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const test_helper_1 = require("./test-helper");
(0, vitest_1.describe)('2. Role-Based Access Control (RBAC) Matrix Verification', () => {
    let adminToken;
    let hrManagerToken;
    let recruiterToken;
    let hiringManagerToken;
    let interviewerToken;
    let approverToken;
    let candidateToken;
    (0, vitest_1.beforeAll)(async () => {
        adminToken = (await (0, test_helper_1.loginAndGetToken)('admin@ats.local')).token;
        hrManagerToken = (await (0, test_helper_1.loginAndGetToken)('hr_manager@ats.local')).token;
        recruiterToken = (await (0, test_helper_1.loginAndGetToken)('recruiter1@ats.local')).token;
        hiringManagerToken = (await (0, test_helper_1.loginAndGetToken)('hiring_manager_eng@ats.local')).token;
        interviewerToken = (await (0, test_helper_1.loginAndGetToken)('interviewer1@ats.local')).token;
        approverToken = (await (0, test_helper_1.loginAndGetToken)('approver@ats.local')).token;
        candidateToken = (await (0, test_helper_1.loginAndGetToken)('candidate1@ats.local')).token;
    });
    (0, vitest_1.describe)('CANDIDATE Role Restrictions', () => {
        (0, vitest_1.it)('CAN view published jobs', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/jobs').set((0, test_helper_1.authHeader)(candidateToken));
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(Array.isArray(res.body.data)).toBe(true);
        });
        (0, vitest_1.it)('CANNOT access recruitment requests (Requisitions) -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/requisitions').set((0, test_helper_1.authHeader)(candidateToken));
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
        });
        (0, vitest_1.it)('CANNOT access interview evaluations -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/evaluations/eval-001').set((0, test_helper_1.authHeader)(candidateToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
        (0, vitest_1.it)('CANNOT access user directory -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/users').set((0, test_helper_1.authHeader)(candidateToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
        (0, vitest_1.it)('CANNOT access audit logs -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/audit-logs').set((0, test_helper_1.authHeader)(candidateToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
    });
    (0, vitest_1.describe)('INTERVIEWER Role Restrictions', () => {
        (0, vitest_1.it)('CANNOT access recruitment requests (Requisitions) -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/requisitions').set((0, test_helper_1.authHeader)(interviewerToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
        (0, vitest_1.it)('CANNOT access job creation -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).post('/api/jobs').set((0, test_helper_1.authHeader)(interviewerToken)).send({
                title: 'Unauthorized Job',
                departmentId: 'dept-id',
                hiringManagerId: 'hm-id',
                description: 'Testing interviewer restriction',
            });
            (0, vitest_1.expect)(res.status).toBe(403);
        });
        (0, vitest_1.it)('CANNOT access offers -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/offers').set((0, test_helper_1.authHeader)(interviewerToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
        (0, vitest_1.it)('CANNOT access user management -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/users').set((0, test_helper_1.authHeader)(interviewerToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
        (0, vitest_1.it)('CAN view assigned evaluation (eval-001) -> 200', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/evaluations/eval-001').set((0, test_helper_1.authHeader)(interviewerToken));
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.data.id).toBe('eval-001');
        });
    });
    (0, vitest_1.describe)('HIRING_MANAGER Role Restrictions', () => {
        (0, vitest_1.it)('CAN view department requisitions', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/requisitions').set((0, test_helper_1.authHeader)(hiringManagerToken));
            (0, vitest_1.expect)(res.status).toBe(200);
        });
        (0, vitest_1.it)('CANNOT view or manage user accounts -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/users').set((0, test_helper_1.authHeader)(hiringManagerToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
        (0, vitest_1.it)('CANNOT access system audit logs -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/audit-logs').set((0, test_helper_1.authHeader)(hiringManagerToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
    });
    (0, vitest_1.describe)('RECRUITER Role Restrictions', () => {
        (0, vitest_1.it)('CAN list and manage candidates', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/candidates').set((0, test_helper_1.authHeader)(recruiterToken));
            (0, vitest_1.expect)(res.status).toBe(200);
        });
        (0, vitest_1.it)('CANNOT manage user accounts -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/users').set((0, test_helper_1.authHeader)(recruiterToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
        (0, vitest_1.it)('CANNOT access audit logs -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/audit-logs').set((0, test_helper_1.authHeader)(recruiterToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
    });
    (0, vitest_1.describe)('APPROVER Role Restrictions', () => {
        (0, vitest_1.it)('CAN view requisitions for approval', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/requisitions').set((0, test_helper_1.authHeader)(approverToken));
            (0, vitest_1.expect)(res.status).toBe(200);
        });
        (0, vitest_1.it)('CANNOT manage user accounts -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/users').set((0, test_helper_1.authHeader)(approverToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
        (0, vitest_1.it)('CANNOT view system audit logs -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/audit-logs').set((0, test_helper_1.authHeader)(approverToken));
            (0, vitest_1.expect)(res.status).toBe(403);
        });
    });
    (0, vitest_1.describe)('HR_MANAGER Role Capabilities & Boundaries', () => {
        (0, vitest_1.it)('CAN read users list -> 200', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/users').set((0, test_helper_1.authHeader)(hrManagerToken));
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(Array.isArray(res.body.data)).toBe(true);
        });
        (0, vitest_1.it)('CAN read audit logs -> 200', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/audit-logs').set((0, test_helper_1.authHeader)(hrManagerToken));
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(Array.isArray(res.body.data)).toBe(true);
        });
        (0, vitest_1.it)('CANNOT create internal users (Admin only) -> 403', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .post('/api/users')
                .set((0, test_helper_1.authHeader)(hrManagerToken))
                .send({
                email: 'unauthorized-user@ats.local',
                password: 'Password123!',
                fullName: 'Unauthorized',
                roles: ['RECRUITER'],
            });
            (0, vitest_1.expect)(res.status).toBe(403);
        });
    });
    (0, vitest_1.describe)('ADMIN Role Full System Privileges', () => {
        (0, vitest_1.it)('CAN read user list -> 200', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/users').set((0, test_helper_1.authHeader)(adminToken));
            (0, vitest_1.expect)(res.status).toBe(200);
        });
        (0, vitest_1.it)('CAN read audit logs -> 200', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/audit-logs').set((0, test_helper_1.authHeader)(adminToken));
            (0, vitest_1.expect)(res.status).toBe(200);
        });
        (0, vitest_1.it)('CAN view candidates across all pipelines -> 200', async () => {
            const res = await (0, supertest_1.default)(app_1.app).get('/api/candidates').set((0, test_helper_1.authHeader)(adminToken));
            (0, vitest_1.expect)(res.status).toBe(200);
        });
    });
});
