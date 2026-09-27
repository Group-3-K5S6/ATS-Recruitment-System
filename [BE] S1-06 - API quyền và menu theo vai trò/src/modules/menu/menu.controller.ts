import { Request, Response } from 'express';
import { MenuService } from './menu.service';
import { successResponse, errorResponse } from '../../utils/response';

export class MenuController {
  /**
   * GET /api/auth/me/menu (or GET /api/menu)
   * Returns user-specific navigation menu based on authenticated server context.
   * Completely ignores any role or parameters passed in client request body/query/headers.
   */
  static async getMyMenu(req: Request, res: Response): Promise<void> {
    const user = req.user;

    if (!user) {
      errorResponse(res, 'Authentication required before accessing menu.', 401, 'UNAUTHORIZED');
      return;
    }

    const menu = MenuService.getMenuForUser(user);
    successResponse(res, menu, 200, 'User navigation menu retrieved successfully');
  }
}
