import { Router } from 'express';
import { RecruitmentBudgetController, createRecruitmentExpenseSchema, updateRecruitmentExpenseSchema } from './recruitment-budget.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission(PermissionCode.RECRUITMENT_BUDGETS_READ), RecruitmentBudgetController.list);
router.get('/summary', requirePermission(PermissionCode.RECRUITMENT_BUDGETS_READ), RecruitmentBudgetController.summary);
router.get('/requisitions/:requisitionId/expenses', requirePermission(PermissionCode.RECRUITMENT_BUDGETS_READ), RecruitmentBudgetController.listExpenses);
router.post(
  '/requisitions/:requisitionId/expenses',
  requirePermission(PermissionCode.RECRUITMENT_BUDGETS_MANAGE),
  validateBody(createRecruitmentExpenseSchema),
  RecruitmentBudgetController.createExpense
);
router.get('/expenses/:expenseId', requirePermission(PermissionCode.RECRUITMENT_BUDGETS_READ), RecruitmentBudgetController.getExpense);
router.put(
  '/expenses/:expenseId',
  requirePermission(PermissionCode.RECRUITMENT_BUDGETS_MANAGE),
  validateBody(updateRecruitmentExpenseSchema),
  RecruitmentBudgetController.updateExpense
);
router.delete('/expenses/:expenseId', requirePermission(PermissionCode.RECRUITMENT_BUDGETS_MANAGE), RecruitmentBudgetController.deleteExpense);

export default router;
