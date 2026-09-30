import { app } from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`ATS Backend RBAC Service running on port ${env.PORT} in ${env.NODE_ENV} mode.`);
  // ADDED: the frontend Vite proxy targets localhost:4000 by default; set PORT to override.
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
