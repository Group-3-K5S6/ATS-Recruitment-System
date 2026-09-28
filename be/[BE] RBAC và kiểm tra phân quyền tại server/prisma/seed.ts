import { PrismaClient } from '@prisma/client';
import '../src/config/env';
import { ALL_ROLES, ROLE_DESCRIPTIONS, RoleType } from '../src/rbac/roles';
import { ALL_PERMISSIONS } from '../src/rbac/permissions';
import { ROLE_PERMISSIONS } from '../src/rbac/role-permissions';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function main() {
  const roles = new Map<string, string>();
  for (const name of ALL_ROLES) {
    const role = await prisma.role.upsert({ where: { name }, update: { description: ROLE_DESCRIPTIONS[name] }, create: { name, description: ROLE_DESCRIPTIONS[name] } });
    roles.set(name, role.id);
  }
  const permissionIds = new Map<string, string>();
  for (const permission of ALL_PERMISSIONS) {
    const saved = await prisma.permission.upsert({ where: { code: permission.code }, update: permission, create: permission });
    permissionIds.set(permission.code, saved.id);
  }
  for (const roleName of ALL_ROLES) {
    const roleId = roles.get(roleName)!;
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    const permissions = ROLE_PERMISSIONS[roleName].map((code) => permissionIds.get(code)).filter((id): id is string => Boolean(id));
    if (permissions.length) await prisma.rolePermission.createMany({ data: permissions.map((permissionId) => ({ roleId, permissionId })) });
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@ats.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'Password123!');
  if (!password || password.length < 12 && process.env.NODE_ENV === 'production') throw new Error('Set SEED_ADMIN_PASSWORD (at least 12 characters) before production seeding.');
  const admin = await prisma.user.upsert({ where: { email }, update: {}, create: { email, fullName: 'System Administrator', passwordHash: await hashPassword(password), roles: { create: { roleId: roles.get(RoleType.ADMIN)! } }, profile: { create: {} } } });
  console.log(`Seeded ${ALL_ROLES.length} roles and ${ALL_PERMISSIONS.length} permissions. Admin: ${admin.email}`);
  if (process.env.NODE_ENV !== 'production' && !process.env.SEED_ADMIN_PASSWORD) console.log('Development admin password: Password123!');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
