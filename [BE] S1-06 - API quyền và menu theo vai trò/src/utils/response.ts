import { Response } from 'express';

export function successResponse<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message?: string
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

export function errorResponse(
  res: Response,
  message: string,
  statusCode = 400,
  code?: string
): Response {
  return res.status(statusCode).json({
    success: false,
    error: {
      code: code || `ERR_${statusCode}`,
      message,
    },
  });
}
