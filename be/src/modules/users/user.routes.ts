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
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionCode.USERS_READ),
  asyncHandler(UserController.list)
);

router.post(
  '/',
  requirePermission(PermissionCode.USERS_CREATE),
  validateBody(createUserSchema),
  asyncHandler(UserController.create)
);

router.put(
  '/:id/roles',
  requirePermission(PermissionCode.ROLES_UPDATE),
  validateBody(assignRolesSchema),
  asyncHandler(UserController.assignRoles)
);

router.patch(
  '/:id/disable',
  requirePermission(PermissionCode.USERS_DISABLE),
  asyncHandler(UserController.disable)
);

router.patch(
  '/:id/enable',
  requirePermission(PermissionCode.USERS_DISABLE),
  asyncHandler(UserController.enable)
);

router.post(
  '/:id/revoke-sessions',
  requirePermission(PermissionCode.USERS_DISABLE),
  asyncHandler(UserController.revokeSessions)
);

export default router;
