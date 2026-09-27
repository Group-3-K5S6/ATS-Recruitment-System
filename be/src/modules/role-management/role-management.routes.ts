import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { errorResponse } from '../../utils/response';
import { RoleType } from '../../rbac/roles';
import { RoleManagementController } from './role-management.controller';

const router = Router();

// Tất cả endpoint quản lý vai trò đều yêu cầu tài khoản đăng nhập.
router.use(authenticate);

// API gán và thu hồi vai trò chỉ dành cho Admin, kiểm tra ở phía máy chủ.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.roles.includes(RoleType.ADMIN)) {
    errorResponse(res, 'Only Admin can manage roles.', 403, 'FORBIDDEN_ROLE');
    return;
  }
  next();
});

router.get('/roles', RoleManagementController.listRoles);
router.get('/users', RoleManagementController.listUsers);
router.post('/users/:userId/roles', RoleManagementController.assignRole);
router.delete('/users/:userId/roles/:role', RoleManagementController.revokeRole);

export default router;
