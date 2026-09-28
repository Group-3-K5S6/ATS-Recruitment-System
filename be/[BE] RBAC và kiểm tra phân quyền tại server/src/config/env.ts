import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./ats.db',
  JWT_SECRET: process.env.JWT_SECRET ?? 'development-only-change-this-access-secret-32-chars',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'development-only-change-this-refresh-secret-32-chars',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
};

const unsafeSecret = (value: string) => value.length < 32 || value.startsWith('development-only') || value.includes('replace-with');
if (env.NODE_ENV === 'production' && (unsafeSecret(env.JWT_SECRET) || unsafeSecret(env.JWT_REFRESH_SECRET))) {
  throw new Error('Set strong JWT_SECRET and JWT_REFRESH_SECRET values in production.');
}
