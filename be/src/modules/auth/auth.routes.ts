import { Router } from 'express';
import { AuthController, loginSchema, registerSchema, refreshSchema } from './auth.controller';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.post('/login', validateBody(loginSchema), asyncHandler(AuthController.login));
router.post('/register', validateBody(registerSchema), asyncHandler(AuthController.register));
router.post('/refresh', validateBody(refreshSchema), asyncHandler(AuthController.refresh));
router.post('/logout', authenticate, asyncHandler(AuthController.logout));
router.get('/me', authenticate, asyncHandler(AuthController.me));

export default router;
