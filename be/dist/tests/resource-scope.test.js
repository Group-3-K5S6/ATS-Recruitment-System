"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const test_helper_1 = require("./test-helper");
const prisma_1 = require("../src/database/prisma");
(0, vitest_1.describe)('3. Resource Scope & Ownership Authorization', () => {
    let hmEngToken;
    let hmMktToken;
    let interviewer1Token;
    let candidate1Token;
    let candidate2Token;
    let mktDeptId;
    let engDeptId;
    (0, vitest_1.beforeAll)(async () => {
        hmEngToken = (await (0, test_helper_1.loginAndGetToken)('hiring_manager_eng@ats.local')).token;
        hmMktToken = (await (0, test_helper_1.loginAndGetToken)('hiring_manager_mkt@ats.local')).token;
        interviewer1Token = (await (0, test_helper_1.loginAndGetToken)('interviewer1@ats.local')).token;
        candidate1Token = (await (0, test_helper_1.loginAndGetToken)('candidate1@ats.local')).token;
        candidate2Token = (await (0, test_helper_1.loginAndGetToken)('candidate2@ats.local')).token;
        const engDept = await prisma_1.prisma.department.findUnique({ where: { code: 'ENG' } });
        const mktDept = await prisma_1.prisma.department.findUnique({ where: { code: 'MKT' } });
        engDeptId = engDept.id;
        mktDeptId = mktDept.id;
    });
    (0, vitest_1.describe)('Hiring Manager Scoped Access', () => {
        (0, vitest_1.it)('CAN view candidate applied to their department job (cand-001)', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get('/api/candidates/cand-001')
                .set((0, test_helper_1.authHeader)(hmEngToken));
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.data.id).toBe('cand-001');
        });
        (0, vitest_1.it)('DENIED (403) from viewing candidate applied to another department job (cand-002)', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get('/api/candidates/cand-002')
                .set((0, test_helper_1.authHeader)(hmEngToken));
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_SCOPE');
        });
        (0, vitest_1.it)('CAN create requisition for own department (ENG)', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .post('/api/requisitions')
                .set((0, test_helper_1.authHeader)(hmEngToken))
                .send({
                title: 'New Senior QA Engineer',
                departmentId: engDeptId,
                headcount: 1,
                budget: 30000000,
            });
            (0, vitest_1.expect)(res.status).toBe(201);
        });
        (0, vitest_1.it)('DENIED (403) from creating requisition for another department (MKT)', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .post('/api/requisitions')
                .set((0, test_helper_1.authHeader)(hmEngToken))
                .send({
                title: 'Unauthorized MKT Requisition',
                departmentId: mktDeptId,
                headcount: 1,
            });
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_SCOPE');
        });
    });
    (0, vitest_1.describe)('Interviewer Scoped Access', () => {
        (0, vitest_1.it)('CAN view candidate they are assigned to interview (cand-001)', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get('/api/candidates/cand-001')
                .set((0, test_helper_1.authHeader)(interviewer1Token));
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.data.id).toBe('cand-001');
        });
        (0, vitest_1.it)('DENIED (403) from viewing candidate they are not assigned to interview (cand-002)', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get('/api/candidates/cand-002')
                .set((0, test_helper_1.authHeader)(interviewer1Token));
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_SCOPE');
        });
        (0, vitest_1.it)('CAN view interview assigned to them (interview-001)', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get('/api/interviews/interview-001')
                .set((0, test_helper_1.authHeader)(interviewer1Token));
            (0, vitest_1.expect)(res.status).toBe(200);
        });
    });
    (0, vitest_1.describe)('Candidate Scoped Access', () => {
        (0, vitest_1.it)('CAN view their own candidate profile (cand-001)', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get('/api/candidates/cand-001')
                .set((0, test_helper_1.authHeader)(candidate1Token));
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.data.id).toBe('cand-001');
        });
        (0, vitest_1.it)('DENIED (403) from viewing another candidate profile (cand-002)', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get('/api/candidates/cand-002')
                .set((0, test_helper_1.authHeader)(candidate1Token));
            (0, vitest_1.expect)(res.status).toBe(403);
            (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_SCOPE');
        });
        (0, vitest_1.it)('CAN view interview scheduled for their own application', async () => {
            const res = await (0, supertest_1.default)(app_1.app)
                .get('/api/interviews/interview-001')
                .set((0, test_helper_1.authHeader)(candidate1Token));
            (0, vitest_1.expect)(res.status).toBe(200);
        });
    });
});
