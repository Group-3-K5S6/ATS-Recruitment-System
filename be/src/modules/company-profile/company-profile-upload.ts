import multer from 'multer';
import { RequestHandler } from 'express';
import { errorResponse } from '../../utils/response';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/png', 'image/jpeg'].includes(file.mimetype)) {
      callback(new Error('UNSUPPORTED_MEDIA'));
      return;
    }
    callback(null, true);
  },
}).single('image');

export const uploadCompanyImage: RequestHandler = (req, res, next) => {
  upload(req, res, error => {
    if (!error) { next(); return; }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      errorResponse(res, 'Ảnh không được vượt quá 3 MB.', 413, 'IMAGE_TOO_LARGE');
      return;
    }
    if (error instanceof Error && error.message === 'UNSUPPORTED_MEDIA') {
      errorResponse(res, 'Chỉ hỗ trợ ảnh JPG hoặc PNG.', 415, 'INVALID_IMAGE');
      return;
    }
    errorResponse(res, 'Không thể tải ảnh. Vui lòng kiểm tra định dạng.', 400, 'UPLOAD_FAILED');
  });
};
