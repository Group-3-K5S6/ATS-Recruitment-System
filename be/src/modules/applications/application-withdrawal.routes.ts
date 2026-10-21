import { Request, RequestHandler, Response, Router } from 'express';
import { ApplicationWithdrawalController } from './application-withdrawal.controller';

const router = Router();

function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

// Email-link possession verifies the candidate; no account or frontend session is required.
router.post('/withdrawal-requests', asyncHandler(ApplicationWithdrawalController.request));
router.get('/withdrawal-confirmation', asyncHandler(ApplicationWithdrawalController.preview));
router.post('/withdrawal-confirmation', asyncHandler(ApplicationWithdrawalController.confirm));

export default router;
