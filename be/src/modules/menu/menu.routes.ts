import { Router } from 'express';
import { MenuController } from './menu.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

// GET /api/menu
router.get('/', authenticate, MenuController.getMyMenu);

export default router;
