"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const response_1 = require("../utils/response");
function errorHandler(err, req, res, _next) {
    const requestedStatus = Number(err?.statusCode);
    const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
        ? requestedStatus
        : 500;
    const message = statusCode >= 500
        ? 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút.'
        : err?.message || 'Yêu cầu không hợp lệ.';
    const code = err?.code || (statusCode === 403
        ? 'FORBIDDEN'
        : statusCode === 404
            ? 'NOT_FOUND'
            : statusCode >= 500
                ? 'INTERNAL_ERROR'
                : `ERR_${statusCode}`);
    if (statusCode >= 500) {
        console.error('[Internal Error]', { requestId: req.requestId, message: err?.message || err });
    }
    (0, response_1.errorResponse)(res, message, statusCode, code, req.requestId);
}
