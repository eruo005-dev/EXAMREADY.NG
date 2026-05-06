import { z } from 'zod';

import { uuidSchema } from './primitives';

export const mediaItemSchema = z.object({
  type: z.enum(['image', 'diagram', 'video']),
  url: z.string().url(),
  alt: z.string().min(1).max(500),
  caption: z.string().max(500).optional(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;
export const mediaArraySchema = z.array(mediaItemSchema).max(10);

export const questionTypeSchema = z.enum([
  'mcq_single',
  'mcq_multi',
  'true_false',
  'fill_blank',
  'theory',
  'comprehension',
  'diagram',
]);

/**
 * Practice question payload returned by GET /api/questions/practice and
 * POST /api/attempts. `is_correct` MUST be omitted from option objects —
 * stripping happens in the handler before serialization.
 */
export const practiceOptionSchema = z.object({
  id: uuidSchema,
  label: z.string().max(2),
  content: z.string(),
  sortOrder: z.number().int(),
});

export const practiceQuestionSchema = z.object({
  id: uuidSchema,
  examId: uuidSchema,
  subjectId: uuidSchema,
  topicId: uuidSchema,
  questionType: questionTypeSchema,
  stem: z.string(),
  passage: z.string().nullable(),
  media: mediaArraySchema,
  difficulty: z.number().int().min(1).max(5),
  year: z.number().int().nullable(),
  source: z.string().nullable(),
  options: z.array(practiceOptionSchema),
});
export type PracticeQuestion = z.infer<typeof practiceQuestionSchema>;

/**
 * Query params for GET /api/questions/practice — used by quick_practice,
 * topic_drill, past_year, mock_cbt, and adaptive modes.
 */
export const practiceQuerySchema = z.object({
  examId: uuidSchema,
  subjectId: uuidSchema.optional(),
  topicIds: z
    .union([uuidSchema, z.array(uuidSchema)])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  mode: z.enum(['quick_practice', 'topic_drill', 'past_year', 'mock_cbt', 'adaptive']),
  count: z.coerce.number().int().min(1).max(50),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
});
export type PracticeQuery = z.infer<typeof practiceQuerySchema>;
