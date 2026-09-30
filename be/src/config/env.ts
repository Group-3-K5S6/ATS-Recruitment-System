import dotenv from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';

// Resolve the backend .env in both source and compiled layouts, independent of cwd.
const envFile = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), 'be/.env'),
  path.resolve(process.cwd(), '.env'),
].find(existsSync);
dotenv.config(envFile ? { path: envFile } : undefined);

function buildDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.DB_HOST?.trim();
  const port = process.env.DB_PORT?.trim() || '5432';
  const name = process.env.DB_NAME?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD;
  if (!host || !name || !user || password === undefined) return '';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(name)}?schema=public`;
}

const configuredEmailFrom = process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '';

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: buildDatabaseUrl(),
  JWT_SECRET: process.env.JWT_SECRET || 'ats-super-secret-jwt-key-for-development-rbac-32chars',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'ats-super-secret-refresh-jwt-key-development',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '',
  SMTP_FROM: configuredEmailFrom,
};
