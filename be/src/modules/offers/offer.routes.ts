import { Router } from 'express';
import {
  OfferController,
  createOfferSchema,
  updateOfferSchema,
  approveOfferSchema,
} from './offer.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionCode.OFFERS_READ),
  OfferController.list
);

router.get(
  '/:id',
  requirePermission(PermissionCode.OFFERS_READ),
  OfferController.getById
);

router.post(
  '/',
  requirePermission(PermissionCode.OFFERS_CREATE),
  validateBody(createOfferSchema),
  OfferController.create
);

router.put(
  '/:id',
  requirePermission(PermissionCode.OFFERS_UPDATE),
  validateBody(updateOfferSchema),
  OfferController.update
);

router.post(
  '/:id/approve',
  requirePermission(PermissionCode.OFFERS_APPROVE),
  validateBody(approveOfferSchema),
  OfferController.approve
);

export default router;
