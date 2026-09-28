import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import auditRoutes from './modules/audit-logs/audit-log.routes';
import { errorHandler } from './middleware/error-handler';
import { errorResponse } from './utils/response';
import { env } from './config/env';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN.split(',').map((value) => value.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use((_req, res) => errorResponse(res, 'Không tìm thấy API.', 404, 'NOT_FOUND'));
  app.use(errorHandler);
  return app;
}
export const app = createApp();
