import { MenuItemConfig } from './menu.types';
import { PermissionCode } from '../../rbac/permissions';
import { RoleType } from '../../rbac/roles';

/**
 * Centralized Menu Registry for ATS Recruitment System
 *
 * Each menu item defines:
 * - key: Unique identifier
 * - label: Display name
 * - path: Client navigation route
 * - icon: UI icon identifier
 * - order: Numerical sorting weight
 * - requiredPermissions: Granular RBAC permissions required
 * - requiredRoles: Specific role restrictions (e.g. CANDIDATE portal)
 * - excludedRoles: Roles explicitly forbidden from this menu
 * - children: Hierarchical sub-menus (filtered recursively)
 */
export const MENU_REGISTRY: MenuItemConfig[] = [
  // 1. Dashboard (Overview metrics & reports)
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: 'dashboard',
    order: 1,
    requiredPermissions: [PermissionCode.REPORTS_READ],
    excludedRoles: [RoleType.CANDIDATE],
    children: [],
  },

  // 2. Requisitions (Recruitment requests)
  {
    key: 'requisitions',
    label: 'Requisitions',
    path: '/requisitions',
    icon: 'file-text',
    order: 2,
    requiredPermissions: [PermissionCode.REQUISITIONS_READ],
    excludedRoles: [RoleType.CANDIDATE],
    children: [
      {
        key: 'all-requisitions',
        label: 'All Requisitions',
        path: '/requisitions',
        icon: 'list',
        order: 1,
        requiredPermissions: [PermissionCode.REQUISITIONS_READ],
      },
      {
        key: 'create-requisition',
        label: 'Create Requisition',
        path: '/requisitions/new',
        icon: 'plus',
        order: 2,
        requiredPermissions: [PermissionCode.REQUISITIONS_CREATE],
      },
    ],
  },

  // 3. Jobs (Internal job postings & publishing)
  {
    key: 'jobs',
    label: 'Jobs',
    path: '/jobs',
    icon: 'briefcase',
    order: 3,
    requiredPermissions: [PermissionCode.JOBS_READ],
    excludedRoles: [RoleType.CANDIDATE, RoleType.INTERVIEWER],
    children: [
      {
        key: 'all-jobs',
        label: 'Job Postings',
        path: '/jobs',
        icon: 'list',
        order: 1,
        requiredPermissions: [PermissionCode.JOBS_READ],
      },
      {
        key: 'create-job',
        label: 'Create Job',
        path: '/jobs/new',
        icon: 'plus',
        order: 2,
        requiredPermissions: [PermissionCode.JOBS_CREATE],
      },
    ],
  },

  // 4. Candidates (Internal candidate pipeline)
  {
    key: 'candidates',
    label: 'Candidates',
    path: '/candidates',
    icon: 'users',
    order: 4,
    requiredPermissions: [PermissionCode.CANDIDATES_READ],
    excludedRoles: [RoleType.CANDIDATE, RoleType.INTERVIEWER],
    children: [
      {
        key: 'all-candidates',
        label: 'Candidate List',
        path: '/candidates',
        icon: 'list',
        order: 1,
        requiredPermissions: [PermissionCode.CANDIDATES_READ],
      },
      {
        key: 'candidate-pipeline',
        label: 'Recruitment Pipeline',
        path: '/candidates/pipeline',
        icon: 'git-pull-request',
        order: 2,
        requiredPermissions: [PermissionCode.CANDIDATES_READ],
      },
    ],
  },

  // 5. Interviews (Interview scheduling & assignments)
  {
    key: 'interviews',
    label: 'Interviews',
    path: '/interviews',
    icon: 'calendar',
    order: 5,
    requiredPermissions: [PermissionCode.INTERVIEWS_READ],
    excludedRoles: [RoleType.CANDIDATE],
    children: [
      {
        key: 'all-interviews',
        label: 'Interview Schedule',
        path: '/interviews',
        icon: 'list',
        order: 1,
        requiredPermissions: [PermissionCode.INTERVIEWS_READ],
      },
      {
        key: 'create-interview',
        label: 'Schedule Interview',
        path: '/interviews/new',
        icon: 'plus',
        order: 2,
        requiredPermissions: [PermissionCode.INTERVIEWS_CREATE],
      },
    ],
  },

  // 6. Evaluations (Interview scoring & feedback)
  {
    key: 'evaluations',
    label: 'Evaluations',
    path: '/evaluations',
    icon: 'clipboard-check',
    order: 6,
    requiredPermissions: [PermissionCode.EVALUATIONS_READ],
    excludedRoles: [RoleType.CANDIDATE],
    children: [],
  },

  // 7. Offers (Offers & Onboarding)
  {
    key: 'offers',
    label: 'Offers',
    path: '/offers',
    icon: 'award',
    order: 7,
    requiredPermissions: [PermissionCode.OFFERS_READ],
    excludedRoles: [RoleType.CANDIDATE],
    children: [
      {
        key: 'all-offers',
        label: 'Offer List',
        path: '/offers',
        icon: 'list',
        order: 1,
        requiredPermissions: [PermissionCode.OFFERS_READ],
      },
      {
        key: 'create-offer',
        label: 'Create Offer',
        path: '/offers/new',
        icon: 'plus',
        order: 2,
        requiredPermissions: [PermissionCode.OFFERS_CREATE],
      },
    ],
  },

  // 8. Reports (Recruitment metrics & analytics)
  {
    key: 'reports',
    label: 'Reports',
    path: '/reports',
    icon: 'bar-chart',
    order: 8,
    requiredPermissions: [PermissionCode.REPORTS_READ],
    excludedRoles: [RoleType.CANDIDATE],
    children: [],
  },

  // 9. Users (User administration & role configuration)
  {
    key: 'users',
    label: 'Users',
    path: '/users',
    icon: 'user-check',
    order: 9,
    requiredPermissions: [PermissionCode.USERS_READ],
    children: [
      {
        key: 'user-list',
        label: 'User Accounts',
        path: '/users',
        icon: 'users',
        order: 1,
        requiredPermissions: [PermissionCode.USERS_READ],
      },
      {
        key: 'role-management',
        label: 'Role Management',
        path: '/users/roles',
        icon: 'shield',
        order: 2,
        requiredPermissions: [PermissionCode.ROLES_READ],
      },
    ],
  },

  // 10. Audit Logs (System audit & compliance tracking)
  {
    key: 'audit-logs',
    label: 'Audit Logs',
    path: '/audit-logs',
    icon: 'shield',
    order: 10,
    requiredPermissions: [PermissionCode.AUDIT_LOGS_READ],
    children: [],
  },

  // 11. Candidate Portal - Jobs
  {
    key: 'candidate-jobs',
    label: 'Job Openings',
    path: '/jobs',
    icon: 'briefcase',
    order: 20,
    requiredRoles: [RoleType.CANDIDATE],
    requiredPermissions: [PermissionCode.JOBS_READ],
    children: [],
  },

  // 12. Candidate Portal - My Applications
  {
    key: 'my-applications',
    label: 'My Applications',
    path: '/my-applications',
    icon: 'file-text',
    order: 21,
    requiredRoles: [RoleType.CANDIDATE],
    requiredPermissions: [PermissionCode.CANDIDATES_READ],
    children: [],
  },

  // 13. Candidate Portal - My Interviews
  {
    key: 'my-interviews',
    label: 'My Interviews',
    path: '/my-interviews',
    icon: 'calendar',
    order: 22,
    requiredRoles: [RoleType.CANDIDATE],
    requiredPermissions: [PermissionCode.INTERVIEWS_READ],
    children: [],
  },

  // 14. Candidate Portal - My Offers
  {
    key: 'my-offers',
    label: 'My Offers',
    path: '/my-offers',
    icon: 'award',
    order: 23,
    requiredRoles: [RoleType.CANDIDATE],
    requiredPermissions: [PermissionCode.OFFERS_READ],
    children: [],
  },
];
