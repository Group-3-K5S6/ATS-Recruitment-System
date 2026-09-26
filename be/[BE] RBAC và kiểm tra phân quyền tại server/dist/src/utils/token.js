"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashToken = hashToken;
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.revokeToken = revokeToken;
exports.isTokenRevoked = isTokenRevoked;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const prisma_1 = require("../database/prisma");
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
function signAccessToken(payload) {
    return jsonwebtoken_1.default.sign({ ...payload, jti: crypto_1.default.randomUUID() }, env_1.env.JWT_SECRET, {
        expiresIn: env_1.env.JWT_EXPIRES_IN,
    });
}
function signRefreshToken(payload) {
    return jsonwebtoken_1.default.sign({ ...payload, jti: crypto_1.default.randomUUID() }, env_1.env.JWT_REFRESH_SECRET, {
        expiresIn: env_1.env.JWT_REFRESH_EXPIRES_IN,
    });
}
function verifyAccessToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
    }
    catch {
        return null;
    }
}
function verifyRefreshToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, env_1.env.JWT_REFRESH_SECRET);
    }
    catch {
        return null;
    }
}
async function revokeToken(token) {
    const decoded = jsonwebtoken_1.default.decode(token);
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tokenHash = hashToken(token);
    await prisma_1.prisma.revokedToken.upsert({
        where: { tokenHash },
        create: { tokenHash, expiresAt },
        update: { expiresAt },
    });
}
async function isTokenRevoked(token) {
    const tokenHash = hashToken(token);
    const record = await prisma_1.prisma.revokedToken.findUnique({
        where: { tokenHash },
    });
    if (!record)
        return false;
    if (record.expiresAt < new Date()) {
        // Clean up expired entry
        await prisma_1.prisma.revokedToken.delete({ where: { tokenHash } }).catch(() => { });
        return false;
    }
    return true;
}
