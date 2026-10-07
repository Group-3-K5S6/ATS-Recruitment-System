import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { RoleType } from '../../rbac/roles';
import { CompanyProfileController } from './company-profile.controller';

const router = Router();
router.use(authenticate, requireRole(RoleType.HR_MANAGER, RoleType.ADMIN));
router.get('/', (req, res, next) => { void CompanyProfileController.get(req, res).catch(next); });
router.put('/', (req, res, next) => { void CompanyProfileController.save(req, res).catch(next); });
export default router;
