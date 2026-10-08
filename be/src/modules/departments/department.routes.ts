import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { PermissionCode } from '../../rbac/permissions';
import {
  DepartmentController,
  createDepartmentSchema,
  updateDepartmentSchema,
} from './department.controller';
import { validateBody } from '../../middleware/validate';

const router = Router();

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

router.use(authenticate);

router.get('/', requirePermission(PermissionCode.ORGANIZATION_READ), asyncRoute(DepartmentController.list));
router.get('/:id', requirePermission(PermissionCode.ORGANIZATION_READ), asyncRoute(DepartmentController.getById));
router.post('/', requirePermission(PermissionCode.ORGANIZATION_WRITE), validateBody(createDepartmentSchema), asyncRoute(DepartmentController.create));
router.put('/:id', requirePermission(PermissionCode.ORGANIZATION_WRITE), validateBody(updateDepartmentSchema), asyncRoute(DepartmentController.update));
router.patch('/:id/status', requirePermission(PermissionCode.ORGANIZATION_WRITE), asyncRoute(DepartmentController.setStatus));
router.delete('/:id', requirePermission(PermissionCode.ORGANIZATION_WRITE), asyncRoute(DepartmentController.delete));

export default router;
