import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { errorResponse } from '../utils/response';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        errorResponse(res, `Validation error: ${issues}`, 400, 'VALIDATION_ERROR');
        return;
      }
      errorResponse(res, 'Invalid request payload format.', 400, 'INVALID_PAYLOAD');
    }
  };
}
