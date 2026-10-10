import { Router } from "express";

import {
  RbacManagementController,
  createPermissionSchema,
  updateRolePermissionsSchema,
} from "./rbac.controller";

import {
  authenticate,
} from "../../middleware/authenticate";

import {
  requireRole,
} from "../../middleware/authorize";

import {
  validateBody,
} from "../../middleware/validate";

import {
  RoleType,
} from "../../rbac/roles";

const router = Router();

/*
 * Toàn bộ trang ma trận phân quyền:
 * CHỈ ADMIN được truy cập.
 */
router.use(
  authenticate,
  requireRole(RoleType.ADMIN),
);

/* Danh sách role và quyền */
router.get(
  "/roles",
  RbacManagementController.listRoles,
);

/* Danh mục quyền */
router.get(
  "/permissions",
  RbacManagementController.listPermissions,
);

/* Tạo quyền mới */
router.post(
  "/permissions",
  validateBody(createPermissionSchema),
  RbacManagementController.createPermission,
);

/* Cấp / thu hồi quyền cho role */
router.put(
  "/roles/:roleId/permissions",
  validateBody(updateRolePermissionsSchema),
  RbacManagementController.updateRolePermissions,
);

export default router;