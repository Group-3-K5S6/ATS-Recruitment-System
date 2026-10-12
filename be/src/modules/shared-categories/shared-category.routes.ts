import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireRole } from '../../middleware/authorize';
import { PermissionCode } from '../../rbac/permissions';
import { RoleType } from '../../rbac/roles';
import { validateBody } from '../../middleware/validate';
import {
  SharedCategoryController, createCategorySchema,
  updateCategorySchema, reorderCategoriesSchema,
} from './shared-category.controller';

const router = Router();
const wrap = (method: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { void method(req, res).catch(next); };
router.use(authenticate);
router.get('/', requirePermission(PermissionCode.ORGANIZATION_READ), wrap(SharedCategoryController.list));
router.use(requireRole(RoleType.HR_MANAGER, RoleType.ADMIN));
router.post('/', validateBody(createCategorySchema), wrap(SharedCategoryController.create));
router.put('/reorder', validateBody(reorderCategoriesSchema), wrap(SharedCategoryController.reorder));
router.put('/:id', validateBody(updateCategorySchema), wrap(SharedCategoryController.update));
router.delete('/:id', wrap(SharedCategoryController.delete));
export default router;
