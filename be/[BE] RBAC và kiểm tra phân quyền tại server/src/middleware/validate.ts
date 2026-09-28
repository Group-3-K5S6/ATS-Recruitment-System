import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
export const validateBody = (schema: ZodType): RequestHandler => (req, _res, next) => {
  const parsed = schema.parse(req.body);
  req.body = parsed;
  next();
};
