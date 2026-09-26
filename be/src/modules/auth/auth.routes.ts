import { Router } from 'express';
import {
  AuthController,
  loginSchema,
  registerSchema,
  refreshSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.controller';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

router.post('/login', validateBody(loginSchema), AuthController.login);
router.post('/register', validateBody(registerSchema), AuthController.register);
router.post('/refresh', validateBody(refreshSchema), AuthController.refresh);
router.post('/logout', authenticate, AuthController.logout);
router.post('/change-password', authenticate, validateBody(changePasswordSchema), AuthController.changePassword);
router.post('/forgot-password', validateBody(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', validateBody(resetPasswordSchema), AuthController.resetPassword);
router.get('/me', authenticate, AuthController.me);

export default router;

