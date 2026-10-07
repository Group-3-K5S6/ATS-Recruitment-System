import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { validateBody } from '../../middleware/validate';
import { requirePermission, requireRole } from '../../middleware/authorize';
import { PermissionCode } from '../../rbac/permissions';
import { RoleType } from '../../rbac/roles';
import { JobTitleController, createJobTitleSchema, updateJobTitleSchema } from './job-title.controller';

const router = Router();

// Salary bands are confidential and accessible only to the HR Manager role.
router.use(authenticate);
router.get('/options', requirePermission(PermissionCode.ORGANIZATION_READ), JobTitleController.options);
router.get('/', requireRole(RoleType.HR_MANAGER), JobTitleController.list);
router.use(requireRole(RoleType.HR_MANAGER));
router.post('/', validateBody(createJobTitleSchema), JobTitleController.create);
router.put('/:id', validateBody(updateJobTitleSchema), JobTitleController.update);
router.delete('/:id', JobTitleController.delete);

export default router;
