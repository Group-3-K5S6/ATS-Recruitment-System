"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("../src/app");
const env_1 = require("../src/config/env");
const test_helper_1 = require("./test-helper");
(0, vitest_1.describe)('1. Authentication & Token Revocation Security', () => {
    let candidateToken;
    (0, vitest_1.beforeAll)(async () => {
        const auth = await (0, test_helper_1.loginAndGetToken)('candidate1@ats.local');
        candidateToken = auth.token;
    });
    (0, vitest_1.it)('rejects request with 401 when Authorization header is missing', async () => {
        const res = await (0, supertest_1.default)(app_1.app).get('/api/candidates');
        (0, vitest_1.expect)(res.status).toBe(401);
        (0, vitest_1.expect)(res.body.error.code).toBe('UNAUTHORIZED');
    });
    (0, vitest_1.it)('rejects request with 401 when token is invalid or corrupted', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/candidates')
            .set('Authorization', 'Bearer invalid.token.payload');
        (0, vitest_1.expect)(res.status).toBe(401);
        (0, vitest_1.expect)(res.body.error.code).toBe('INVALID_TOKEN');
    });
    (0, vitest_1.it)('rejects request with 401 when token is signed with wrong secret', async () => {
        const fakeToken = jsonwebtoken_1.default.sign({ userId: 'fake-id', email: 'fake@ats.local' }, 'wrong-secret-key', {
            expiresIn: '1h',
        });
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/candidates')
            .set('Authorization', `Bearer ${fakeToken}`);
        (0, vitest_1.expect)(res.status).toBe(401);
        (0, vitest_1.expect)(res.body.error.code).toBe('INVALID_TOKEN');
    });
    (0, vitest_1.it)('rejects request with 401 when token is expired', async () => {
        const expiredToken = jsonwebtoken_1.default.sign({ userId: 'fake-id', email: 'fake@ats.local' }, env_1.env.JWT_SECRET, {
            expiresIn: '-10s',
        });
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/candidates')
            .set('Authorization', `Bearer ${expiredToken}`);
        (0, vitest_1.expect)(res.status).toBe(401);
        (0, vitest_1.expect)(res.body.error.code).toBe('INVALID_TOKEN');
    });
    (0, vitest_1.it)('allows access with valid JWT token on /api/auth/me', async () => {
        const res = await (0, supertest_1.default)(app_1.app)
            .get('/api/auth/me')
            .set((0, test_helper_1.authHeader)(candidateToken));
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body.data.email).toBe('candidate1@ats.local');
        (0, vitest_1.expect)(res.body.data.roles).toContain('CANDIDATE');
    });
    (0, vitest_1.it)('revokes token on logout and denies subsequent access with 401', async () => {
        // 1. Login to get a dedicated token
        const { token } = await (0, test_helper_1.loginAndGetToken)('candidate2@ats.local');
        // 2. Token works
        const check1 = await (0, supertest_1.default)(app_1.app)
            .get('/api/auth/me')
            .set((0, test_helper_1.authHeader)(token));
        (0, vitest_1.expect)(check1.status).toBe(200);
        // 3. Logout
        const logoutRes = await (0, supertest_1.default)(app_1.app)
            .post('/api/auth/logout')
            .set((0, test_helper_1.authHeader)(token));
        (0, vitest_1.expect)(logoutRes.status).toBe(200);
        // 4. Token is now revoked
        const check2 = await (0, supertest_1.default)(app_1.app)
            .get('/api/auth/me')
            .set((0, test_helper_1.authHeader)(token));
        (0, vitest_1.expect)(check2.status).toBe(401);
        (0, vitest_1.expect)(check2.body.error.code).toBe('TOKEN_REVOKED');
    });
});
