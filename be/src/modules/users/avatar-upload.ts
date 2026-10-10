import multer from 'multer';
import { Request, RequestHandler } from 'express';
import { errorResponse } from '../../utils/response';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export interface UploadedAvatarRequest extends Request {
  file?: Express.Multer.File;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png') {
      callback(new Error('INVALID_AVATAR_TYPE'));
      return;
    }
    callback(null, true);
  },
}).single('avatar');

export const uploadAvatar: RequestHandler = (req, res, next) => {
  upload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      errorResponse(res, 'Ảnh đại diện không được vượt quá 2 MB.', 413, 'AVATAR_TOO_LARGE');
      return;
    }
    if (error instanceof Error && error.message === 'INVALID_AVATAR_TYPE') {
      errorResponse(res, 'Chỉ chấp nhận ảnh JPG hoặc PNG.', 415, 'INVALID_AVATAR_TYPE');
      return;
    }
    errorResponse(res, 'Yêu cầu tải ảnh đại diện không hợp lệ.', 400, 'INVALID_UPLOAD');
  });
};
