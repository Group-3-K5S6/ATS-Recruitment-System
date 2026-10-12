import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { RoleType } from '../../rbac/roles';
import { CompanyProfileController } from './company-profile.controller';
import { uploadCompanyImage } from './company-profile-upload';

const router = Router();
router.get('/public', (req, res, next) => { void CompanyProfileController.getPublic(req, res).catch(next); });
router.use(authenticate, requireRole(RoleType.HR_MANAGER, RoleType.ADMIN));
router.post('/media/:kind', uploadCompanyImage, (req, res, next) => { void CompanyProfileController.uploadImage(req, res).catch(next); });
router.get('/', (req, res, next) => { void CompanyProfileController.get(req, res).catch(next); });
router.put('/', (req, res, next) => { void CompanyProfileController.save(req, res).catch(next); });
export default router;
