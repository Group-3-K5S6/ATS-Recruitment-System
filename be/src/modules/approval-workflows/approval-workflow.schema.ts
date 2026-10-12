import { z } from 'zod';

export const workflowRangeSchema = z.object({
  minSalary: z.coerce.number().int().nonnegative({
    message: 'Mức lương bắt đầu phải là số nguyên không âm.',
  }),
  maxSalary: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int().nonnegative().nullable()
  ),
  approverIds: z
    .array(z.string().trim().min(1, 'Người phê duyệt không được để trống.'))
    .min(1, 'Mỗi dải lương phải có ít nhất 1 cấp phê duyệt.')
    .max(3, 'Chỉ được cấu hình tối đa 3 cấp phê duyệt.'),
});

export const saveWorkflowSchema = z.object({
  departmentId: z.string().trim().min(1, 'Hãy chọn phòng ban cần áp dụng luồng phê duyệt.'),
  activation: z.enum(['NEW_REQUESTS_ONLY']).optional().default('NEW_REQUESTS_ONLY'),
  ranges: z.array(workflowRangeSchema).min(1, 'Cấu hình phải có ít nhất 1 dải lương.'),
});

export type SaveWorkflowSchemaType = z.infer<typeof saveWorkflowSchema>;
