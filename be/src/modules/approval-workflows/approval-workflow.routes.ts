import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { RoleType } from '../../rbac/roles';
import { ApprovalWorkflowController } from './approval-workflow.controller';
import { saveWorkflowSchema } from './approval-workflow.schema';

const router = Router();

router.use(authenticate);
router.use(requireRole(RoleType.HR_MANAGER, RoleType.ADMIN));

router.get('/', ApprovalWorkflowController.list);
router.get('/:departmentId', ApprovalWorkflowController.getByDepartment);
router.post('/', validateBody(saveWorkflowSchema), ApprovalWorkflowController.save);

export default router;
