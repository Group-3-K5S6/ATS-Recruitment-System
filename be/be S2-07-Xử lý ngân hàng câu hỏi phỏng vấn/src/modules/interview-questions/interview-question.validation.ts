import { z } from 'zod';
import { QuestionDifficulty } from './interview-question.types';

const difficultyEnum = z.nativeEnum(QuestionDifficulty, {
  errorMap: () => ({
    message: 'Difficulty must be one of: EASY, MEDIUM, HARD',
  }),
});

export const createInterviewQuestionSchema = z
  .object({
    question: z.string().trim().min(1, 'Question content cannot be empty.').optional(),
    content: z.string().trim().min(1, 'Question content cannot be empty.').optional(),
    difficulty: difficultyEnum,
    suggestedAnswer: z
      .string()
      .trim()
      .min(1, 'Suggested answer cannot be empty.'),
    competencyCriterionId: z
      .string()
      .trim()
      .min(1, 'Competency criterion ID cannot be empty.'),
  })
  .refine((data) => !!(data.question || data.content), {
    message: 'Question content cannot be empty.',
    path: ['question'],
  })
  .transform((data) => ({
    ...data,
    question: (data.question || data.content)!.trim(),
  }));

export const updateInterviewQuestionSchema = z
  .object({
    question: z.string().trim().min(1, 'Question content cannot be empty.').optional(),
    content: z.string().trim().min(1, 'Question content cannot be empty.').optional(),
    difficulty: difficultyEnum.optional(),
    suggestedAnswer: z
      .string()
      .trim()
      .min(1, 'Suggested answer cannot be empty.')
      .optional(),
    competencyCriterionId: z
      .string()
      .trim()
      .min(1, 'Competency criterion ID cannot be empty.')
      .optional(),
  })
  .transform((data) => {
    const effectiveQuestion = data.question || data.content;
    return {
      ...data,
      ...(effectiveQuestion ? { question: effectiveQuestion.trim() } : {}),
    };
  });

export const filterInterviewQuestionQuerySchema = z.object({
  search: z.string().trim().optional(),
  competencyFrameworkId: z.string().trim().optional(),
  competencyCriterionId: z.string().trim().optional(),
  difficulty: difficultyEnum.optional(),
});
