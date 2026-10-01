import { Router } from 'express';
import {
  UserController,
  createUserSchema,
  assignRolesSchema,
  importPayloadSchema,
} from './user.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionCode.USERS_READ),
  UserController.list
);

router.get('/import/template', UserController.downloadTemplate);

router.post(
  '/import/preview',
  requirePermission(PermissionCode.USERS_CREATE),
  validateBody(importPayloadSchema),
  UserController.previewImport
);

router.post(
  '/import',
  requirePermission(PermissionCode.USERS_CREATE),
  validateBody(importPayloadSchema),
  UserController.importUsers
);

router.post(
  '/',
  requirePermission(PermissionCode.USERS_CREATE),
  validateBody(createUserSchema),
  UserController.create
);

router.put(
  '/:id/roles',
  requirePermission(PermissionCode.ROLES_UPDATE),
  validateBody(assignRolesSchema),
  UserController.assignRoles
);

router.patch(
  '/:id/disable',
  requirePermission(PermissionCode.USERS_DISABLE),
  UserController.disable
);

export default router;
