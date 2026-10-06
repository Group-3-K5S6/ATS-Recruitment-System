import { Router } from 'express';

import {
  UserController,
  createUserSchema,
  updateUserSchema,
  assignRolesSchema,
  importPayloadSchema,
  updateProfileSchema,
} from './user.controller';

import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get('/me', UserController.getProfile);

router.put(
  '/me',
  validateBody(updateProfileSchema),
  UserController.updateProfile
);


/*
 * DANH SÁCH TÀI KHOẢN
 */
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

/*
 * TẠO TÀI KHOẢN
 */
router.post(
  '/',
  requirePermission(PermissionCode.USERS_CREATE),
  validateBody(createUserSchema),
  UserController.create
);

/*
 * S1-08 - SỬA TÀI KHOẢN
 *
 * Tạm dùng USERS_CREATE vì project hiện tại
 * chưa khai báo USERS_UPDATE riêng.
 */
router.put(
  '/:id',
  requirePermission(PermissionCode.USERS_UPDATE),
  validateBody(updateUserSchema),
  UserController.update
);

/*
 * S1-09 - GÁN / THU HỒI VAI TRÒ
 */
router.put(
  '/:id/roles',
  requirePermission(PermissionCode.ROLES_UPDATE),
  validateBody(assignRolesSchema),
  UserController.assignRoles
);

/*
 * S1-10 - KHÓA
 */
router.patch(
  '/:id/disable',
  requirePermission(PermissionCode.USERS_DISABLE),
  UserController.disable
);

/*
 * S1-10 - MỞ KHÓA
 */
router.patch(
  '/:id/enable',
  requirePermission(PermissionCode.USERS_DISABLE),
  UserController.enable
);

export default router;