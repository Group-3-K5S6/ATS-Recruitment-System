import { Router } from 'express';
import { AuthController, loginSchema, refreshSchema, logoutSchema } from './auth.controller';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

router.post('/login', validateBody(loginSchema), AuthController.login);
router.post('/refresh', validateBody(refreshSchema), AuthController.refresh);
router.post('/logout', authenticate, validateBody(logoutSchema), AuthController.logout);
router.get('/me', authenticate, AuthController.me);

export default router;
