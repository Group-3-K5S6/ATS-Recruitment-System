import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/response';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Safe logging in server console only
  console.error('[Internal Error]:', err?.message || err);

  const statusCode = err?.statusCode || 500;
  const message =
    statusCode >= 500
      ? 'An unexpected error occurred. Please contact support.'
      : err?.message || 'Bad Request';

  errorResponse(res, message, statusCode, err?.code || 'INTERNAL_ERROR');
}
