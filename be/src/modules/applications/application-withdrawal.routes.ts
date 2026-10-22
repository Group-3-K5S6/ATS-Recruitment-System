import { Request, RequestHandler, Response, Router } from 'express';
import { errorResponse } from '../../utils/response';
import { ApplicationWithdrawalController } from './application-withdrawal.controller';

const router = Router();
function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => { void handler(req, res).catch(next); };
}

const attempts = new Map<string, { count: number; expiresAt: number }>();
const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const REQUEST_LIMIT = 6;

const requestLimiter: RequestHandler = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = attempts.get(ip);
  const current = (!record || now > record.expiresAt)
    ? { count: 0, expiresAt: now + REQUEST_WINDOW_MS }
    : record;
  current.count += 1;
  attempts.set(ip, current);
  if (current.count > REQUEST_LIMIT) {
    res.setHeader('Retry-After', Math.ceil((current.expiresAt - now) / 1000));
    errorResponse(res, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429, 'RATE_LIMIT_EXCEEDED');
    return;
  }
  next();
};

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of attempts) {
    if (now > record.expiresAt) attempts.delete(ip);
  }
}, 60 * 60 * 1000);
cleanup.unref();

router.post('/withdrawal-requests', requestLimiter, asyncHandler(ApplicationWithdrawalController.request));
router.get('/withdrawal-confirmation', asyncHandler(ApplicationWithdrawalController.preview));
router.post('/withdrawal-confirmation', asyncHandler(ApplicationWithdrawalController.confirm));

export default router;
