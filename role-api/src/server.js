require('dotenv').config();

const crypto = require('node:crypto');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
// Prisma generates its client beside the shared schema in the main backend package.
const { PrismaClient } = require('../../be/node_modules/@prisma/client');

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 4001);
const JWT_SECRET = process.env.JWT_SECRET;
const ROLE_NAMES = [
  'CANDIDATE',
  'RECRUITER',
  'HIRING_MANAGER',
  'INTERVIEWER',
  'HR_MANAGER',
  'APPROVER',
  'ADMIN',
];

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must match the backend JWT_SECRET.');
}

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '32kb' }));

function sendError(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

function sendSuccess(res, data, message) {
  return res.json({ success: true, message, data });
}

async function authenticateAdmin(req, res, next) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return sendError(res, 401, 'UNAUTHORIZED', 'Bearer token is required.');

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.userId) return sendError(res, 401, 'INVALID_TOKEN', 'Invalid access token.');

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const revoked = await prisma.revokedToken.findUnique({ where: { tokenHash } });
    if (revoked && revoked.expiresAt > new Date()) {
      return sendError(res, 401, 'TOKEN_REVOKED', 'This access token has been revoked.');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.isActive) {
      return sendError(res, 401, 'ACCOUNT_INACTIVE', 'User account is unavailable.');
    }
    if (!user.roles.some(({ role }) => role.name === 'ADMIN')) {
      return sendError(res, 403, 'FORBIDDEN_ROLE', 'Only Admin can manage roles.');
    }

    req.actor = user;
    req.authToken = token;
    next();
  } catch {
    return sendError(res, 401, 'INVALID_TOKEN', 'Invalid or expired access token.');
  }
}

app.get('/health', (_req, res) => sendSuccess(res, { status: 'ok' }));
app.use('/api/role-management', authenticateAdmin);

app.get('/api/role-management/roles', (_req, res) => {
  sendSuccess(res, ROLE_NAMES, 'Roles loaded.');
});

app.get('/api/role-management/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        department: { select: { name: true } },
        roles: { include: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      department: user.department?.name || '',
      roles: user.roles.map(({ role }) => role.name),
    })), 'Users loaded.');
  } catch (error) {
    next(error);
  }
});

app.post('/api/role-management/users/:userId/roles', async (req, res, next) => {
  try {
    const { role } = req.body || {};
    if (!ROLE_NAMES.includes(role)) {
      return sendError(res, 400, 'INVALID_ROLE', 'Select a valid role.');
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) return sendError(res, 404, 'NOT_FOUND', 'User not found.');
    const roleRecord = await prisma.role.findUnique({ where: { name: role } });
    if (!roleRecord) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role is not configured.');

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: target.id, roleId: roleRecord.id } },
      create: { userId: target.id, roleId: roleRecord.id },
      update: {},
    });
    await writeAudit(req, 'ROLE_ASSIGNED', target.id, { role });
    return sendSuccess(res, { userId: target.id, role }, 'Role assigned.');
  } catch (error) {
    next(error);
  }
});

app.delete('/api/role-management/users/:userId/roles/:role', async (req, res, next) => {
  try {
    const roleName = req.params.role.toUpperCase();
    if (!ROLE_NAMES.includes(roleName)) {
      return sendError(res, 400, 'INVALID_ROLE', 'Select a valid role.');
    }
    const target = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: { roles: { include: { role: true } } },
    });
    if (!target) return sendError(res, 404, 'NOT_FOUND', 'User not found.');

    const assignedRole = target.roles.find(({ role }) => role.name === roleName);
    if (!assignedRole) return sendError(res, 404, 'ROLE_NOT_ASSIGNED', 'User does not have this role.');
    if (req.actor.id === target.id && roleName === 'ADMIN') {
      return sendError(res, 409, 'CANNOT_REVOKE_SELF_ADMIN', 'You cannot revoke your own Admin role.');
    }

    if (roleName === 'ADMIN') {
      const adminCount = await prisma.userRole.count({
        where: { roleId: assignedRole.roleId, user: { isActive: true } },
      });
      if (target.isActive && adminCount <= 1) {
        return sendError(res, 409, 'LAST_ADMIN', 'At least one active Admin must remain.');
      }
    }

    await prisma.userRole.delete({
      where: { userId_roleId: { userId: target.id, roleId: assignedRole.roleId } },
    });
    await writeAudit(req, 'ROLE_REVOKED', target.id, { role: roleName });
    return sendSuccess(res, { userId: target.id, role: roleName }, 'Role revoked.');
  } catch (error) {
    next(error);
  }
});

async function writeAudit(req, action, resourceId, metadata) {
  await prisma.auditLog.create({
    data: {
      actorId: req.actor.id,
      action,
      resourceType: 'user',
      resourceId,
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
      metadata: JSON.stringify(metadata),
    },
  });
}

app.use((error, _req, res, _next) => {
  console.error('[role-management-api]', error?.message || error);
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
});

const server = app.listen(PORT, () => {
  console.log(`Role management API listening on port ${PORT}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
