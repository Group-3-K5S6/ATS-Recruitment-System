import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { errorResponse } from '../utils/response';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) return errorResponse(res, 'Dữ liệu gửi lên không hợp lệ.', 400, 'VALIDATION_ERROR');
  if (env.NODE_ENV !== 'production') console.error(error);
  return errorResponse(res, 'Đã xảy ra lỗi máy chủ.', 500, 'INTERNAL_ERROR');
};
