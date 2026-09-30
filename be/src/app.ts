import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler';
import { errorResponse } from './utils/response';
import { prisma } from './database/prisma';

import authRoutes from './modules/auth/auth.routes';
import candidateRoutes from './modules/candidates/candidate.routes';
import requisitionRoutes from './modules/requisitions/requisition.routes';
import jobRoutes from './modules/jobs/job.routes';
import interviewRoutes from './modules/interviews/interview.routes';
import evaluationRoutes from './modules/evaluations/evaluation.routes';
import offerRoutes from './modules/offers/offer.routes';
import reportRoutes from './modules/reports/report.routes';
import userRoutes from './modules/users/user.routes';
import auditLogRoutes from './modules/audit-logs/audit-log.routes';
import menuRoutes from './modules/menu/menu.routes';

export function createApp() {
  const app = express();

  // Security Middlewares
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Health check
  // ADDED: readiness check confirms both HTTP and Prisma/database connectivity.
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', database: 'disconnected', timestamp: new Date().toISOString() });
    }
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/candidates', candidateRoutes);
  app.use('/api/requisitions', requisitionRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/interviews', interviewRoutes);
  app.use('/api/evaluations', evaluationRoutes);
  app.use('/api/offers', offerRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/candidates', candidateRoutes);
  // Catch-all 404
  app.use((_req: Request, res: Response) => {
    errorResponse(res, 'Route not found.', 404, 'NOT_FOUND');
  });

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
