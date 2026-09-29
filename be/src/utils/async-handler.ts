import { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncController = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Forward rejected async controller promises to Express 4's error middleware. */
export function asyncHandler(controller: AsyncController): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(controller(req, res, next)).catch(next);
  };
}
