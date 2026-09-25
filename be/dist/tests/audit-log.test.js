"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const test_helper_1 = require("./test-helper");
(0, vitest_1.describe)('7. Audit Logging Trail & Access Verification', () => {
    let adminToken;
    let candidateToken;
    (0, vitest_1.beforeAll)(async () => {
        adminToken = (await (0, test_helper_1.loginAndGetToken)('admin@ats.local')).token;
        candidateToken = (await (0, test_helper_1.loginAndGetToken)('candidate1@ats.local')).token;
    });
    (0, vitest_1.it)('Candidate CANNOT access audit logs -> 403', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/audit-logs')
            .set((0, test_helper_1.authHeader)(candidateToken));
        (0, vitest_1.expect)(res.status).toBe(403);
        (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_PERMISSION');
    });
    (0, vitest_1.it)('Admin CAN access audit logs and view chronological events -> 200', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/audit-logs')
            .set((0, test_helper_1.authHeader)(adminToken));
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(Array.isArray(res.body.data)).toBe(true);
        (0, vitest_1.expect)(res.body.data.length).toBeGreaterThan(0);
        const firstLog = res.body.data[0];
        (0, vitest_1.expect)(firstLog).toHaveProperty('action');
        (0, vitest_1.expect)(firstLog).toHaveProperty('resourceType');
        (0, vitest_1.expect)(firstLog).toHaveProperty('createdAt');
    });
    (0, vitest_1.it)('Actions performed by users trigger corresponding audit log entries', async () => {
        // 1. Create a candidate as Admin
        const createRes = await (0, supertest_1.default)(app_1.app)
            .post('/api/candidates')
            .set((0, test_helper_1.authHeader)(adminToken))
            .send({
            fullName: 'Audit Log Test Candidate',
            email: `audit-test-${Date.now()}@test.internal`,
        });
        (0, vitest_1.expect)(createRes.status).toBe(201);
        const candidateId = createRes.body.data.id;
        // 2. Query audit logs for CANDIDATE_CREATED action
        const auditRes = await (0, supertest_1.default)(app_1.app)
            .get(`/api/audit-logs?action=CANDIDATE_CREATED&resourceType=candidate`)
            .set((0, test_helper_1.authHeader)(adminToken));
        (0, vitest_1.expect)(auditRes.status).toBe(200);
        const matchedLog = auditRes.body.data.find((log) => log.resourceId === candidateId);
        (0, vitest_1.expect)(matchedLog).toBeDefined();
        (0, vitest_1.expect)(matchedLog.action).toBe('CANDIDATE_CREATED');
    });
});
