import { RoleType } from './roles';
import { ALL_PERMISSIONS } from './permissions';

const full = ALL_PERMISSIONS.map((permission) => permission.code);
export const ROLE_PERMISSIONS: Record<RoleType, string[]> = {
  ADMIN: full,
  HR_MANAGER: full.filter((p) => !p.startsWith('roles:') && !p.startsWith('users:create') && !p.startsWith('users:disable')),
  RECRUITER: ['candidates:read','candidates:create','candidates:update','requisitions:read','requisitions:create','jobs:read','jobs:create','jobs:update','jobs:publish','interviews:read','interviews:create','interviews:update','evaluations:read','evaluations:create','offers:read','offers:create','offers:update','reports:read','profile:read','profile:update'],
  HIRING_MANAGER: ['requisitions:read','requisitions:create','jobs:read','candidates:read','interviews:read','evaluations:read','offers:read','reports:read','profile:read','profile:update'],
  INTERVIEWER: ['candidates:read','interviews:read','evaluations:read','evaluations:create','profile:read','profile:update'],
  APPROVER: ['requisitions:read','requisitions:approve','jobs:read','candidates:read','evaluations:read','offers:read','offers:approve','reports:read','profile:read','profile:update'],
  CANDIDATE: ['jobs:read','candidates:read','candidates:create','candidates:update','interviews:read','offers:read','profile:read','profile:update'],
};
