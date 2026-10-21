import multer from 'multer';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../../utils/response';

export const MAX_CV_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx']);
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CV_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      callback(new Error('INVALID_CV_EXTENSION'));
      return;
    }
    const mime = file.mimetype.toLowerCase();
    if (mime && !ALLOWED_MIMES.has(mime)) {
      callback(new Error('INVALID_CV_MIME'));
      return;
    }
    callback(null, true);
  },
}).fields([
  { name: 'cv', maxCount: 1 },
  { name: 'file', maxCount: 1 },
]);

/**
 * Validates the file buffer magic bytes (file signature) to ensure the uploaded
 * content is genuine PDF or DOCX and not an executable or spoofed file.
 */
export function validateCvMagicBytes(buffer: Buffer, originalname: string): { valid: boolean; error?: string } {
  if (!buffer || buffer.length < 4) {
    return { valid: false, error: 'Tệp CV không có nội dung hoặc bị hỏng.' };
  }

  const ext = path.extname(originalname).toLowerCase();

  // PDF signature: starts with %PDF (0x25 0x50 0x44 0x46)
  const isPdf =
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46;

  // DOCX (ZIP archive) signature: starts with PK\x03\x04 (0x50 0x4b 0x03 0x04)
  const isZip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  // DOCX Office Open XML structure verification:
  // Must contain standard Word packaging entries such as 'word/' or '[Content_Types].xml'
  const hasDocxStructure =
    buffer.includes(Buffer.from('word/')) ||
    buffer.includes(Buffer.from('[Content_Types].xml'));

  const isDocx = isZip && hasDocxStructure;

  if (ext === '.pdf') {
    if (!isPdf) {
      return { valid: false, error: 'Tệp không có nội dung PDF hợp lệ. Vui lòng kiểm tra lại CV.' };
    }
  } else if (ext === '.docx') {
    if (!isDocx) {
      return { valid: false, error: 'Tệp không có nội dung DOCX hợp lệ. Vui lòng kiểm tra lại CV.' };
    }
  } else {
    return { valid: false, error: 'CV chỉ chấp nhận định dạng PDF hoặc DOCX.' };
  }

  return { valid: true };
}

/**
 * Express middleware for CV upload handling with comprehensive security checks
 */
export function uploadCvMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (!err) {
      // Normalize single file to req.file if uploaded via fields
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      if (files?.cv?.[0]) {
        req.file = files.cv[0];
      } else if (files?.file?.[0]) {
        req.file = files.file[0];
      }
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        errorResponse(res, 'Dung lượng CV vượt quá giới hạn tối đa 10 MB.', 413, 'CV_TOO_LARGE');
        return;
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        errorResponse(res, 'Chỉ được tải lên 1 tệp CV.', 400, 'UNEXPECTED_FILE');
        return;
      }
      errorResponse(res, 'Lỗi khi tải tệp CV: ' + err.message, 400, 'UPLOAD_ERROR');
      return;
    }

    if (err instanceof Error) {
      if (err.message === 'INVALID_CV_EXTENSION' || err.message === 'INVALID_CV_MIME') {
        errorResponse(res, 'CV chỉ chấp nhận định dạng PDF hoặc DOCX.', 415, 'INVALID_CV_FORMAT');
        return;
      }
    }

    errorResponse(res, 'Yêu cầu tải tệp CV không hợp lệ.', 400, 'INVALID_UPLOAD');
  });
}
