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
function errorResponse(res, message, statusCode = 400, code, requestId) {
    const correlationId = requestId || res.getHeader('X-Request-Id');
    const errorCode = code || (statusCode === 403
        ? 'FORBIDDEN'
        : statusCode === 404
            ? 'NOT_FOUND'
            : statusCode >= 500
                ? 'INTERNAL_ERROR'
                : `ERR_${statusCode}`);
    const userMessage = statusCode === 401
        ? errorCode === 'INVALID_CREDENTIALS'
            ? 'Email hoặc mật khẩu không chính xác.'
            : 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.'
        : statusCode === 403
            ? 'Bạn chưa được cấp quyền truy cập chức năng này. Hãy quay lại trang trước hoặc liên hệ quản trị viên.'
            : statusCode === 404
                ? 'Không tìm thấy trang hoặc dữ liệu bạn yêu cầu.'
                : statusCode >= 500
                    ? 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút.'
                    : message;
    return res.status(statusCode).json({
        success: false,
    error: {
        code: errorCode,
        message: userMessage,
        requestId: correlationId,
        action: statusCode === 401
            ? 'LOGIN_AGAIN'
            : statusCode === 403
                ? 'BACK_TO_DASHBOARD'
                : statusCode === 404
                    ? 'BACK_TO_PREVIOUS_PAGE'
                    : statusCode >= 500
                        ? 'RETRY_LATER'
                        : 'REVIEW_INPUT',
    },
    });
}
