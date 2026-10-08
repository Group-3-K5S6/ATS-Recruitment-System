import { Request, Response } from 'express';
import { z } from 'zod';
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
type CompanyProfileRecord = typeof defaultProfile & { updatedAt?: Date };

export class CompanyProfileController {
  static async get(_req: Request, res: Response) {
    const rows = await prisma.$queryRaw<CompanyProfileRecord[]>`
      SELECT id, "companyName", tagline, introduction, culture, benefits,
             website, "contactEmail", location, "isPublished", "updatedAt"
      FROM "CompanyProfile" WHERE id = 'default' LIMIT 1
    `;
    return successResponse(res, rows[0] ?? defaultProfile);
  }

  static async save(req: Request, res: Response) {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return errorResponse(res, parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.', 400, 'VALIDATION_ERROR');
    }
    const data = parsed.data;
    const rows = await prisma.$queryRaw<CompanyProfileRecord[]>`
      INSERT INTO "CompanyProfile" (
        id, "companyName", tagline, introduction, culture, benefits,
        website, "contactEmail", location, "isPublished", "updatedAt"
      ) VALUES (
        'default', ${data.companyName}, ${data.tagline}, ${data.introduction},
        ${data.culture}, ${data.benefits}, ${data.website}, ${data.contactEmail},
        ${data.location}, ${data.isPublished}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        "companyName" = EXCLUDED."companyName",
        tagline = EXCLUDED.tagline,
        introduction = EXCLUDED.introduction,
        culture = EXCLUDED.culture,
        benefits = EXCLUDED.benefits,
        website = EXCLUDED.website,
        "contactEmail" = EXCLUDED."contactEmail",
        location = EXCLUDED.location,
        "isPublished" = EXCLUDED."isPublished",
        "updatedAt" = NOW()
      RETURNING id, "companyName", tagline, introduction, culture, benefits,
                website, "contactEmail", location, "isPublished", "updatedAt"
    `;
    const profile = rows[0];
    return successResponse(res, profile, 200, 'Đã lưu cấu hình trang giới thiệu công ty.');
  }
}
