"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const response_1 = require("../utils/response");
function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        next(err);
        return;
    }
    // Express/body-parser errors commonly expose `status`, while application
    // errors in this project use `statusCode`. Accept both so malformed JSON
    // and oversized payloads do not become misleading 500 responses.
    const requestedStatus = Number(err?.statusCode ?? err?.status);
    const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
        ? requestedStatus
        : 500;
    const parserErrorCodes = {
        'entity.parse.failed': 'INVALID_JSON',
        'entity.too.large': 'PAYLOAD_TOO_LARGE',
    };
    const code = parserErrorCodes[err?.type] || err?.code || (statusCode === 401
        ? 'UNAUTHORIZED'
        : statusCode === 403
        ? 'FORBIDDEN'
        : statusCode === 404
            ? 'NOT_FOUND'
            : statusCode >= 500
                ? 'INTERNAL_ERROR'
                : `ERR_${statusCode}`);
    const message = statusCode >= 500
        ? 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút.'
        : statusCode === 400 && err?.type === 'entity.parse.failed'
            ? 'Dữ liệu JSON không đúng định dạng. Vui lòng kiểm tra lại thông tin gửi lên.'
            : statusCode === 413
                ? 'Dữ liệu gửi lên vượt quá dung lượng cho phép.'
                : err?.message || 'Yêu cầu không hợp lệ.';
    if (statusCode >= 500) {
        console.error('[Internal Error]', { requestId: req.requestId, message: err?.message || err });
    }
    (0, response_1.errorResponse)(res, message, statusCode, code, req.requestId);
}
