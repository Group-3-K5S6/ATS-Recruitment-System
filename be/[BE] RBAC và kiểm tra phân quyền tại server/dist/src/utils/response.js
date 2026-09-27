"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successResponse = successResponse;
exports.errorResponse = errorResponse;
function successResponse(res, data, statusCode = 200, message) {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
}
function errorResponse(res, message, statusCode = 400, code) {
    const defaultCode = statusCode === 403
        ? 'FORBIDDEN'
        : statusCode === 404
            ? 'NOT_FOUND'
            : statusCode >= 500
                ? 'INTERNAL_ERROR'
                : `ERR_${statusCode}`;
    return res.status(statusCode).json({
        success: false,
        error: {
            code: code || defaultCode,
            message,
        },
    });
}
