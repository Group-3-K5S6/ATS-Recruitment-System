import dotenv from 'dotenv';
import path from 'path';

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
});

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),

  NODE_ENV:
    process.env.NODE_ENV || 'development',

  DATABASE_URL:
    process.env.DATABASE_URL || 'file:./ats.db',

  JWT_SECRET:
    process.env.JWT_SECRET ||
    'ats-super-secret-jwt-key-for-development-rbac-32chars',

  JWT_EXPIRES_IN:
    process.env.JWT_EXPIRES_IN || '1h',

  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ||
    'ats-super-secret-refresh-jwt-key-development',

  JWT_REFRESH_EXPIRES_IN:
    process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // S1-03 - Email
  SMTP_HOST:
    process.env.SMTP_HOST || 'smtp.gmail.com',

  SMTP_PORT:
    parseInt(process.env.SMTP_PORT || '587', 10),

  SMTP_USER:
    process.env.SMTP_USER || '',

  SMTP_PASS:
    process.env.SMTP_PASS || '',

  MAIL_FROM:
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    '',

  FRONTEND_URL:
    process.env.FRONTEND_URL ||
    'http://localhost:5173',
};