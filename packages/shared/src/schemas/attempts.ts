import { z } from 'zod';

import { uuidSchema } from './primitives';

export const attemptModeSchema = z.enum([
  'quick_practice',
  'topic_drill',
  'past_year',
  'mock_cbt',
  'adaptive',
  'flashcard',
]);

export const startAttemptSchema = z.object({
  mode: attemptModeSchema,
  examId: uuidSchema,
  subjectId: uuidSchema.optional(),
  topicId: uuidSchema.optional(),
  questionIds: z.array(uuidSchema).min(1).max(200),
  timeLimitSeconds: z.number().int().positive().max(60 * 60 * 8).optional(),
});
export type StartAttemptInput = z.infer<typeof startAttemptSchema>;

/**
 * PATCH /api/attempts/:id/answer — saves a user's answer for a single
 * question. The handler NEVER computes or returns is_correct; correctness
 * is frozen during POST /:id/submit only.
 */
export const submitAnswerSchema = z
  .object({
    questionId: uuidSchema,
    selectedOptionIds: z.array(uuidSchema).max(10).optional(),
    textAnswer: z.string().max(10_000).optional(),
    timeSpentSeconds: z.number().int().nonnegative().max(60 * 60).optional(),
    flagged: z.boolean().optional(),
  })
  .refine(
    (v) => v.selectedOptionIds !== undefined || v.textAnswer !== undefined || v.flagged !== undefined,
    { message: 'Provide at least one of selectedOptionIds, textAnswer, or flagged' },
  );
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

export const attemptBreakdownItemSchema = z.object({
  questionId: uuidSchema,
  isCorrect: z.boolean(),
  selectedOptionIds: z.array(uuidSchema).nullable(),
  correctOptionIds: z.array(uuidSchema),
  explanation: z.string(),
  topicId: uuidSchema,
  topicName: z.string(),
});

export const attemptResultSchema = z.object({
  attemptId: uuidSchema,
  correctCount: z.number().int().nonnegative(),
  totalQuestions: z.number().int().positive(),
  accuracyPercent: z.number().min(0).max(100),
  timeSpentSeconds: z.number().int().nonnegative(),
  submittedAt: z.string().datetime(),
  breakdown: z.array(attemptBreakdownItemSchema),
});
export type AttemptResult = z.infer<typeof attemptResultSchema>;
