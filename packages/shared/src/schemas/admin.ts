import { z } from 'zod';

import { paginationSchema, uuidSchema } from './primitives';
import { mediaArraySchema, questionTypeSchema } from './questions';

const optionInputSchema = z.object({
  label: z.string().min(1).max(2),
  content: z.string().min(1).max(2000),
  isCorrect: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});

export const questionCreateInputSchema = z.object({
  examId: uuidSchema,
  subjectId: uuidSchema,
  topicId: uuidSchema,
  questionType: questionTypeSchema,
  stem: z.string().min(5).max(5000),
  passage: z.string().max(10_000).optional(),
  media: mediaArraySchema.optional().default([]),
  difficulty: z.number().int().min(1).max(5),
  year: z.number().int().min(1990).max(2100).optional(),
  source: z.string().max(100).optional(),
  explanation: z.string().min(5).max(5000),
  frequencyScore: z.number().int().min(0).max(100).default(50),
  isActive: z.boolean().default(true),
  options: z.array(optionInputSchema).min(2).max(10),
});
export type QuestionCreateInput = z.infer<typeof questionCreateInputSchema>;

export const questionUpdateInputSchema = questionCreateInputSchema
  .partial()
  // Disallow examId reassignment — too easy to corrupt past_year filters by
  // mistake. Admins delete + recreate the question if they need to move it.
  .omit({ examId: true });
export type QuestionUpdateInput = z.infer<typeof questionUpdateInputSchema>;

export const questionListQuerySchema = paginationSchema.extend({
  examId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  topicId: uuidSchema.optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  isActive: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
  q: z.string().min(1).max(200).optional(), // free-text search on stem
});
export type QuestionListQuery = z.infer<typeof questionListQuerySchema>;

/**
 * Per-row CSV import error. Row index is 1-based to match what the user
 * sees in their CSV editor.
 */
export const csvImportErrorSchema = z.object({
  row: z.number().int().positive(),
  message: z.string(),
});
export type CsvImportError = z.infer<typeof csvImportErrorSchema>;
