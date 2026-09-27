"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const response_1 = require("../utils/response");
function errorHandler(err, _req, res, _next) {
    // Safe logging in server console only
    console.error('[Internal Error]:', err?.message || err);
    const statusCode = err?.statusCode || 500;
    const message = statusCode >= 500
        ? 'An unexpected error occurred. Please contact support.'
        : err?.message || 'Bad Request';
    (0, response_1.errorResponse)(res, message, statusCode, err?.code || 'INTERNAL_ERROR');
}
