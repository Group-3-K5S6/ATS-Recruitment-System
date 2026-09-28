import type { Response } from 'express';

export function successResponse(res: Response, data: unknown, status = 200, message?: string) {
  return res.status(status).json({ success: true, ...(message ? { message } : {}), data });
}

export function errorResponse(res: Response, message: string, status = 400, code = 'BAD_REQUEST') {
  return res.status(status).json({ success: false, error: { code, message } });
}
