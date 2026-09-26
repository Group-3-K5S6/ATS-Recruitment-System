import { Router } from 'express';
import {
  UserController,
  createUserSchema,
  assignRolesSchema,
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
