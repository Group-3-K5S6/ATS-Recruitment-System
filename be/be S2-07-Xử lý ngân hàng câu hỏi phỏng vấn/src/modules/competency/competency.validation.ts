import { z } from 'zod';

export const criterionItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Criterion name cannot be empty').max(255),
  description: z.string().optional().nullable(),
  weight: z
    .number({ invalid_type_error: 'Weight must be a number' })
    .positive('Weight must be greater than 0')
    .max(100, 'Weight cannot exceed 100'),
});

export const createFrameworkSchema = z
  .object({
    name: z.string().trim().min(2, 'Framework name must be at least 2 characters').max(255),
    description: z.string().optional().nullable(),
    isActive: z.boolean().optional().default(true),
    jobIds: z.array(z.string()).optional(),
    criteria: z
      .array(criterionItemSchema)
      .min(1, 'Framework must contain at least one criterion'),
  })
  .superRefine((data, ctx) => {
    // Check duplicate criterion names (case-insensitive)
    const seenNames = new Set<string>();
    for (let i = 0; i < data.criteria.length; i++) {
      const normalized = data.criteria[i].name.trim().toLowerCase();
      if (seenNames.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate criterion name "${data.criteria[i].name}" within framework.`,
          path: ['criteria', i, 'name'],
        });
      }
      seenNames.add(normalized);
    }

    // Check sum of weights equals 100%
    const totalWeight = data.criteria.reduce((sum, item) => sum + item.weight, 0);
    const rounded = Number(totalWeight.toFixed(4));
    if (Math.abs(rounded - 100) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Total criteria weight must equal 100%. Current sum: ${Number(totalWeight.toFixed(2))}%.`,
        path: ['criteria'],
      });
    }
  });

export const updateFrameworkSchema = z
  .object({
    name: z.string().trim().min(2, 'Framework name must be at least 2 characters').max(255).optional(),
    description: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
    jobIds: z.array(z.string()).optional(),
    criteria: z.array(criterionItemSchema).min(1, 'Framework must contain at least one criterion').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.criteria && data.criteria.length > 0) {
      // Check duplicate criterion names (case-insensitive)
      const seenNames = new Set<string>();
      for (let i = 0; i < data.criteria.length; i++) {
        const normalized = data.criteria[i].name.trim().toLowerCase();
        if (seenNames.has(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate criterion name "${data.criteria[i].name}" within framework.`,
            path: ['criteria', i, 'name'],
          });
        }
        seenNames.add(normalized);
      }

      // Check sum of weights equals 100%
      const totalWeight = data.criteria.reduce((sum, item) => sum + item.weight, 0);
      const rounded = Number(totalWeight.toFixed(4));
      if (Math.abs(rounded - 100) > 0.001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Total criteria weight must equal 100%. Current sum: ${Number(totalWeight.toFixed(2))}%.`,
          path: ['criteria'],
        });
      }
    }
  });

export const createCriterionSchema = z.object({
  name: z.string().trim().min(1, 'Criterion name cannot be empty').max(255),
  description: z.string().optional().nullable(),
  weight: z
    .number({ invalid_type_error: 'Weight must be a number' })
    .positive('Weight must be greater than 0')
    .max(100, 'Weight cannot exceed 100'),
});

export const updateCriterionSchema = z.object({
  name: z.string().trim().min(1, 'Criterion name cannot be empty').max(255).optional(),
  description: z.string().optional().nullable(),
  weight: z
    .number({ invalid_type_error: 'Weight must be a number' })
    .positive('Weight must be greater than 0')
    .max(100, 'Weight cannot exceed 100')
    .optional(),
});

export const assignJobsSchema = z.object({
  jobIds: z.array(z.string()).min(1, 'At least one job ID must be provided'),
});
