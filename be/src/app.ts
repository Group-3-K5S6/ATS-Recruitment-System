import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler';
import { errorResponse } from './utils/response';


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
import interviewQuestionRoutes from './modules/interview-questions/interview-question.routes';
import jobTitleRoutes from './modules/job-titles/job-title.routes';
import departmentRoutes from './modules/departments/department.routes';
import companyProfileRoutes from './modules/company-profile/company-profile.routes';
import competencyFrameworkRoutes from './modules/competency-frameworks/competency-framework.routes';

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
  app.use('/api/candidates', candidateRoutes);
  app.use('/api/requisitions', requisitionRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/job-titles', jobTitleRoutes);
  app.use('/api/interviews', interviewRoutes);
  app.use('/api/evaluations', evaluationRoutes);
  app.use('/api/offers', offerRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/interview-questions', interviewQuestionRoutes);
app.use('/api/departments', departmentRoutes);
  app.use('/api/company-profile', companyProfileRoutes);
  app.use('/api/competency-frameworks', competencyFrameworkRoutes);
  // Catch-all 404
  app.use((_req: Request, res: Response) => {
    errorResponse(res, 'Route not found.', 404, 'NOT_FOUND');
  });

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
