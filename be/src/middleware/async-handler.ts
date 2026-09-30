import { RequestHandler } from 'express';

/** Forwards rejected async route handlers to Express 4's error middleware. */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve().then(() => handler(req, res, next)).catch(next);
  };
}
