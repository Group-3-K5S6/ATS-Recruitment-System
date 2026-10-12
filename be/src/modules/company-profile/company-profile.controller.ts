import { Request, Response } from 'express';
import { z } from 'zod';
import sharp from 'sharp';
import { prisma } from '../../database/prisma';
import { errorResponse, successResponse } from '../../utils/response';

const profileSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(180),
  introduction: z.string().trim().max(5000),
  culture: z.string().trim().max(3000),
  benefits: z.string().trim().max(3000),
  website: z.string().trim().max(250),
  contactEmail: z.string().trim().max(250),
  location: z.string().trim().max(250),
  isPublished: z.boolean(),
});

const defaultProfile = {
  id: 'default', companyName: '', tagline: '', introduction: '', culture: '',
  benefits: '', website: '', contactEmail: '', location: '', isPublished: false,
};
export class CompanyProfileController {
  static async getPublic(_req: Request, res: Response) {
    const profile = await prisma.companyProfile.findUnique({ where: { id: 'default' } });
    if (!profile || !profile.isPublished) {
      return errorResponse(res, 'Trang giới thiệu công ty chưa được xuất bản.', 404, 'NOT_PUBLISHED');
    }
    return successResponse(res, profile);
  }

  static async uploadImage(req: Request, res: Response) {
    const kind = req.params.kind;
    if (kind !== 'logo' && kind !== 'banner') {
      return errorResponse(res, 'Loại ảnh không hợp lệ.', 400, 'INVALID_IMAGE_KIND');
    }
    if (!req.file) return errorResponse(res, 'Vui lòng chọn ảnh để tải lên.', 400, 'IMAGE_REQUIRED');
    try {
      const input = sharp(req.file.buffer, { limitInputPixels: 20_000_000 });
      const metadata = await input.metadata();
      if (!['png', 'jpeg'].includes(metadata.format || '')) {
        return errorResponse(res, 'Ảnh JPG hoặc PNG không hợp lệ.', 415, 'INVALID_IMAGE');
      }
      const output = await input.rotate().resize(
        kind === 'logo' ? 400 : 1400, kind === 'logo' ? 400 : 480,
        { fit: 'cover', position: 'attention' },
      ).webp({ quality: kind === 'logo' ? 78 : 74 }).toBuffer();
      const dataUri = `data:image/webp;base64,${output.toString('base64')}`;
      const imageData = kind === 'logo'
        ? { logoData: dataUri }
        : { bannerData: dataUri };
      const profile = await prisma.companyProfile.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...imageData },
        update: imageData,
      });
      return successResponse(res, profile, 200, 'Đã cập nhật hình ảnh công ty.');
    } catch {
      return errorResponse(res, 'Ảnh không thể xử lý. Vui lòng chọn ảnh JPG hoặc PNG khác.', 400, 'INVALID_IMAGE');
    }
  }

  static async get(_req: Request, res: Response) {
    const profile = await prisma.companyProfile.findUnique({ where: { id: 'default' } });
    return successResponse(res, profile ?? defaultProfile);
  }

  static async save(req: Request, res: Response) {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return errorResponse(res, parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.', 400, 'VALIDATION_ERROR');
    }
    const profile = await prisma.companyProfile.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...parsed.data },
      update: parsed.data,
    });
    return successResponse(res, profile, 200, 'Đã lưu cấu hình trang giới thiệu công ty.');
  }
}
