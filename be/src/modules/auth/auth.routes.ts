import { Router } from 'express';
import { AuthController, loginSchema, registerSchema, refreshSchema, forgotPasswordSchema, verifyOtpSchema, verifyRegistrationOtpSchema, resetPasswordSchema } from './auth.controller';
import { validateBody } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { asyncHandler } from '../../middleware/async-handler';

const router = Router();

router.post('/login', validateBody(loginSchema), asyncHandler(AuthController.login));
router.post('/register', validateBody(registerSchema), asyncHandler(AuthController.register));
router.post('/verify-registration-otp', validateBody(verifyRegistrationOtpSchema), asyncHandler(AuthController.verifyRegistrationOtp));
router.post('/refresh', validateBody(refreshSchema), asyncHandler(AuthController.refresh));
router.post('/forgot-password', validateBody(forgotPasswordSchema), asyncHandler(AuthController.forgotPassword));
router.post('/verify-reset-otp', validateBody(verifyOtpSchema), asyncHandler(AuthController.verifyPasswordResetOtp));
router.post('/reset-password', validateBody(resetPasswordSchema), asyncHandler(AuthController.resetPassword));
router.post('/logout', asyncHandler(authenticate), asyncHandler(AuthController.logout));
router.get('/me', asyncHandler(authenticate), asyncHandler(AuthController.me));

export default router;
