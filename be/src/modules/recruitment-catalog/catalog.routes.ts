import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission, requireRole } from '../../middleware/authorize';
import { RoleType } from '../../rbac/roles';
import { PermissionCode } from '../../rbac/permissions';
import { RecruitmentCatalogController } from './catalog.controller';

const router = Router();
router.use(authenticate);
router.get('/', requirePermission(PermissionCode.ORGANIZATION_READ), (req, res, next) => { void RecruitmentCatalogController.list(req, res).catch(next); });
router.use(requireRole(RoleType.HR_MANAGER, RoleType.ADMIN));
router.post('/', (req, res, next) => { void RecruitmentCatalogController.create(req, res).catch(next); });
router.patch('/:id', (req, res, next) => { void RecruitmentCatalogController.update(req, res).catch(next); });
router.delete('/:id', (req, res, next) => { void RecruitmentCatalogController.archive(req, res).catch(next); });
export default router;
