import { PrismaClient } from '@prisma/client';

// PR84 local: use real MAIN database only when explicitly configured by the launcher.
const databaseUrl = process.env.DATABASE_URL;
export const prisma = new PrismaClient({
  ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
