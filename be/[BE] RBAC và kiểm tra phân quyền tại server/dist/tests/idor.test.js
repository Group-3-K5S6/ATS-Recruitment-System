"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const test_helper_1 = require("./test-helper");
(0, vitest_1.describe)('5. Insecure Direct Object Reference (IDOR) Protection', () => {
    let candidate1Token;
    let candidate2Token;
    let interviewer2Token;
    (0, vitest_1.beforeAll)(async () => {
        candidate1Token = (await (0, test_helper_1.loginAndGetToken)('candidate1@ats.local')).token;
        candidate2Token = (await (0, test_helper_1.loginAndGetToken)('candidate2@ats.local')).token;
        interviewer2Token = (await (0, test_helper_1.loginAndGetToken)('interviewer2@ats.local')).token;
    });
    (0, vitest_1.it)('Candidate 1 accessing own candidate profile (cand-001) -> 200', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/candidates/cand-001')
            .set((0, test_helper_1.authHeader)(candidate1Token));
        (0, vitest_1.expect)(res.status).toBe(200);
    });
    (0, vitest_1.it)('Candidate 1 tampering ID to access Candidate 2 (cand-002) is BLOCKED with 403', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/candidates/cand-002')
            .set((0, test_helper_1.authHeader)(candidate1Token));
        (0, vitest_1.expect)(res.status).toBe(403);
        (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });
    (0, vitest_1.it)('Candidate 1 tampering ID to download Candidate 2 CV is BLOCKED with 403', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/candidates/cand-002/cv')
            .set((0, test_helper_1.authHeader)(candidate1Token));
        (0, vitest_1.expect)(res.status).toBe(403);
        (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });
    (0, vitest_1.it)('Candidate 2 tampering ID to read Candidate 1 offer (offer-001) is BLOCKED with 403', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/offers/offer-001')
            .set((0, test_helper_1.authHeader)(candidate2Token));
        (0, vitest_1.expect)(res.status).toBe(403);
        (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });
    (0, vitest_1.it)('Interviewer 2 tampering ID to view Interviewer 1 evaluation (eval-001) is BLOCKED with 403', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/evaluations/eval-001')
            .set((0, test_helper_1.authHeader)(interviewer2Token));
        (0, vitest_1.expect)(res.status).toBe(403);
        (0, vitest_1.expect)(res.body.error.code).toBe('FORBIDDEN_SCOPE');
    });
});
