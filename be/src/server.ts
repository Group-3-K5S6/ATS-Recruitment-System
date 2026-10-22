import { app } from './app';
import { env } from './config/env';
import { startJobExpirationScheduler } from './modules/jobs/job-expiration.scheduler';

const stopJobExpirationScheduler = startJobExpirationScheduler();

const server = app.listen(env.PORT, () => {
  console.log(`ATS Backend RBAC Service running on port ${env.PORT} in ${env.NODE_ENV} mode.`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  stopJobExpirationScheduler();
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  stopJobExpirationScheduler();
  server.close(() => process.exit(0));
});
