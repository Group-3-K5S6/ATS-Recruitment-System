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
    return res.status(statusCode).json({
        success: false,
        error: {
            code: code || `ERR_${statusCode}`,
            message,
        },
    });
}
