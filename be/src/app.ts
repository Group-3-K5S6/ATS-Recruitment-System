import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler';
import { errorResponse } from './utils/response';

import authRoutes from './modules/auth/auth.routes';

export function createApp() {
  const app = express();

  // Security Middlewares
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);

  // Catch-all 404
  app.use((_req: Request, res: Response) => {
    errorResponse(res, 'Route not found.', 404, 'NOT_FOUND');
  });

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
