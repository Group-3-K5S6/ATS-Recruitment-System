import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { CandidateController, createCandidateSchema, updateCandidateSchema } from './candidate.controller';
import { authenticate } from '../../middleware/authenticate';
import { requirePermission } from '../../middleware/authorize';
import { validateBody } from '../../middleware/validate';
import { PermissionCode } from '../../rbac/permissions';
import { errorResponse } from '../../utils/response';

const router = Router();

const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const uploadSingleCv = (req: Request, res: Response, next: NextFunction) => {
  cvUpload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ])(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        errorResponse(res, 'Dung lượng tệp CV vượt quá giới hạn tối đa 10 MB.', 413, 'CV_TOO_LARGE');
        return;
      }
      errorResponse(res, 'Lỗi khi tải tệp CV lên.', 400, 'UPLOAD_ERROR');
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files?.cv?.[0]) {
      req.file = files.cv[0];
    } else if (files?.file?.[0]) {
      req.file = files.file[0];
    }

    next();
  });
};

router.use(authenticate);

// S4-04: Bóc tách thông tin ứng viên từ CV PDF cho Recruiter
router.post(
  '/parse-cv',
  requirePermission(PermissionCode.CANDIDATES_CREATE),
  uploadSingleCv,
  CandidateController.parseCv
);

router.get(
  '/',
  requirePermission(PermissionCode.CANDIDATES_READ),
  CandidateController.list
);

router.get(
  '/:id',
  requirePermission(PermissionCode.CANDIDATES_READ),
  CandidateController.getById
);

router.get(
  '/:id/cv',
  requirePermission(PermissionCode.CANDIDATES_READ),
  CandidateController.getCv
);

router.post(
  '/',
  requirePermission(PermissionCode.CANDIDATES_CREATE),
  validateBody(createCandidateSchema),
  CandidateController.create
);

router.put(
  '/:id',
  requirePermission(PermissionCode.CANDIDATES_UPDATE),
  validateBody(updateCandidateSchema),
  CandidateController.update
);

router.delete(
  '/:id',
  requirePermission(PermissionCode.CANDIDATES_DELETE),
  CandidateController.delete
);

export default router;
