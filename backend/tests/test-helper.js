"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginAndGetToken = loginAndGetToken;
exports.authHeader = authHeader;
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
async function loginAndGetToken(email, password = 'Password123!') {
    const res = await (0, supertest_1.default)(app_1.app)
        .post('/api/auth/login')
        .send({ email, password });
    if (res.status !== 200) {
        throw new Error(`Failed to login ${email}: ${JSON.stringify(res.body)}`);
    }
    return {
        token: res.body.data.accessToken,
        user: res.body.data.user,
    };
}
function authHeader(token) {
    return { Authorization: `Bearer ${token}` };
}
