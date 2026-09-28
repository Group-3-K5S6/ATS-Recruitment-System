const modules = ['users', 'roles', 'profile', 'audit_logs', 'candidates', 'requisitions', 'jobs', 'interviews', 'evaluations', 'offers', 'reports', 'organization'];
const actions = ['read', 'create', 'update', 'delete', 'disable', 'publish', 'approve'];
export const ALL_PERMISSIONS = modules.flatMap((module) => actions.map((action) => ({
  code: `${module}:${action}`, module, description: `${action} ${module}`,
})));
export const PermissionCode = {
  USERS_READ: 'users:read', USERS_CREATE: 'users:create', USERS_DISABLE: 'users:disable',
  ROLES_UPDATE: 'roles:update', PROFILE_READ: 'profile:read', PROFILE_UPDATE: 'profile:update', AUDIT_LOGS_READ: 'audit_logs:read',
} as const;
