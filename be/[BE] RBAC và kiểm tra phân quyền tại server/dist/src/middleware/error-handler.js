"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const response_1 = require("../utils/response");
function errorHandler(err, _req, res, _next) {
    // Safe logging in server console only
    console.error('[Internal Error]:', err?.message || err);
    const requestedStatus = Number(err?.statusCode);
    const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
        ? requestedStatus
        : 500;
    const message = statusCode >= 500
        ? 'An unexpected error occurred. Please contact support.'
        : err?.message || 'Bad Request';
    const code = err?.code || (statusCode === 403
        ? 'FORBIDDEN'
        : statusCode === 404
            ? 'NOT_FOUND'
            : statusCode >= 500
                ? 'INTERNAL_ERROR'
                : `ERR_${statusCode}`);
    (0, response_1.errorResponse)(res, message, statusCode, code);
}
