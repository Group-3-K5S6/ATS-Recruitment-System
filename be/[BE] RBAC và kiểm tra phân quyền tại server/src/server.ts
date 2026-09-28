import { app } from './app';
import { env } from './config/env';
import { prisma } from './database/prisma';
const server = app.listen(env.PORT, () => console.log(`ATS backend listening on port ${env.PORT} (${env.NODE_ENV}).`));
async function shutdown() { server.close(async () => { await prisma.$disconnect(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
