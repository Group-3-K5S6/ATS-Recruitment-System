import { z } from 'zod';

export const publicJobApplicationSchema = z.object({
  fullName: z
    .string({ required_error: 'Họ và tên là bắt buộc.' })
    .trim()
    .min(2, 'Họ và tên phải có ít nhất 2 ký tự.')
    .max(100, 'Họ và tên không được vượt quá 100 ký tự.'),
  email: z
    .string({ required_error: 'Email là bắt buộc.' })
    .trim()
    .email('Địa chỉ email không hợp lệ.')
    .max(150, 'Email không được vượt quá 150 ký tự.'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+() -]{8,20}$/, 'Số điện thoại không hợp lệ.')
    .optional()
    .or(z.literal('')),
  source: z
    .string()
    .trim()
    .max(255, 'Nguồn biết tin không được vượt quá 255 ký tự.')
    .optional()
    .or(z.literal('')),
  coverLetter: z
    .string()
    .trim()
    .max(5000, 'Thư giới thiệu không được vượt quá 5000 ký tự.')
    .optional()
    .or(z.literal('')),
  jobId: z
    .string()
    .trim()
    .optional(),
  cvUrl: z
    .string()
    .trim()
    .optional(),
});

export type PublicJobApplicationInput = z.infer<typeof publicJobApplicationSchema>;
