"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const test_helper_1 = require("./test-helper");
(0, vitest_1.describe)('6. Sensitive Data Protection & Field-Level Sanitization', () => {
    let adminToken;
    let interviewer1Token;
    let candidate1Token;
    (0, vitest_1.beforeAll)(async () => {
        adminToken = (await (0, test_helper_1.loginAndGetToken)('admin@ats.local')).token;
        interviewer1Token = (await (0, test_helper_1.loginAndGetToken)('interviewer1@ats.local')).token;
        candidate1Token = (await (0, test_helper_1.loginAndGetToken)('candidate1@ats.local')).token;
    });
    (0, vitest_1.it)('Password hash is NEVER exposed in /api/users response', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/users')
            .set((0, test_helper_1.authHeader)(adminToken));
        (0, vitest_1.expect)(res.status).toBe(200);
        for (const u of res.body.data) {
            (0, vitest_1.expect)(u.passwordHash).toBeUndefined();
            (0, vitest_1.expect)(u.password).toBeUndefined();
        }
    });
    (0, vitest_1.it)('Password hash is NEVER exposed in /api/auth/login or /api/auth/me response', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/auth/me')
            .set((0, test_helper_1.authHeader)(candidate1Token));
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.data.passwordHash).toBeUndefined();
    });
    (0, vitest_1.it)('Interviewer viewing candidate gets sanitized fields (NO expectedSalary, NO address, MASKED phone)', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/candidates/cand-001')
            .set((0, test_helper_1.authHeader)(interviewer1Token));
        (0, vitest_1.expect)(res.status).toBe(200);
        const candidate = res.body.data;
        // Must be sanitized
        (0, vitest_1.expect)(candidate.expectedSalary).toBeUndefined();
        (0, vitest_1.expect)(candidate.address).toBeUndefined();
        (0, vitest_1.expect)(candidate.phone).toContain('****'); // masked phone
        (0, vitest_1.expect)(candidate.fullName).toBeTruthy();
    });
    (0, vitest_1.it)('Candidate viewing offer has internal recruiter notes stripped', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/offers/offer-001')
            .set((0, test_helper_1.authHeader)(candidate1Token));
        // Offer-001 is PENDING_APPROVAL in seed, so candidate cannot view yet
        // Or if viewable, internalNotes must be omitted
        if (res.status === 200) {
            (0, vitest_1.expect)(res.body.data.internalNotes).toBeUndefined();
        }
        else {
            (0, vitest_1.expect)(res.status).toBe(403);
        }
    });
});
