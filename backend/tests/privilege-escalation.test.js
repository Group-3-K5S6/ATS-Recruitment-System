"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const test_helper_1 = require("./test-helper");
(0, vitest_1.describe)('4. Privilege Escalation Prevention', () => {
    let candidateToken;
    let candidateId;
    let recruiterToken;
    (0, vitest_1.beforeAll)(async () => {
        const cand = await (0, test_helper_1.loginAndGetToken)('candidate1@ats.local');
        candidateToken = cand.token;
        candidateId = cand.user.id;
        const rec = await (0, test_helper_1.loginAndGetToken)('recruiter1@ats.local');
        recruiterToken = rec.token;
    });
    (0, vitest_1.it)('Candidate CANNOT elevate themselves to ADMIN role via role assignment API', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .put(`/api/users/${candidateId}/roles`)
            .set((0, test_helper_1.authHeader)(candidateToken))
            .send({ roles: ['ADMIN'] });
        (0, vitest_1.expect)(res.status).toBe(403);
    });
    (0, vitest_1.it)('Recruiter CANNOT grant permissions or change roles of any user', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .put(`/api/users/${candidateId}/roles`)
            .set((0, test_helper_1.authHeader)(recruiterToken))
            .send({ roles: ['ADMIN'] });
        (0, vitest_1.expect)(res.status).toBe(403);
    });
    (0, vitest_1.it)('Candidate cannot forge userId in request body to create candidate under another user account', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .post('/api/candidates')
            .set((0, test_helper_1.authHeader)(candidateToken))
            .send({
            fullName: 'Spoofed Identity',
            email: 'spoofed@evil.com',
            userId: 'admin-target-user-id',
        });
        (0, vitest_1.expect)([200, 201]).toContain(res.status);
        // Server must enforce candidate.userId = authenticated candidate's ID, not spoofed body
        (0, vitest_1.expect)(res.body.data.userId).toBe(candidateId);
    });
    (0, vitest_1.it)('Non-admin user CANNOT disable other accounts', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .patch(`/api/users/${candidateId}/disable`)
            .set((0, test_helper_1.authHeader)(recruiterToken));
        (0, vitest_1.expect)(res.status).toBe(403);
    });
});
