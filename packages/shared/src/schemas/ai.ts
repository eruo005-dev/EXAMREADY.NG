import { z } from 'zod';

import { uuidSchema } from './primitives';

/**
 * Sprint 6: levels are snake_case ('with_analogy', 'pidgin') and a new
 * 'step_by_step' level was added. Older clients sending 'with-analogy'
 * or 'in-pidgin' will get a 400; the rename is a hard cutover, not a
 * compatibility shim. UI was redeployed in lockstep.
 */
export const explainLevelSchema = z.enum(['simpler', 'with_analogy', 'step_by_step', 'pidgin']);
export type ExplainLevel = z.infer<typeof explainLevelSchema>;

export const explainDifferentlyInputSchema = z.object({
  questionId: uuidSchema,
  level: explainLevelSchema,
});
export type ExplainDifferentlyInput = z.infer<typeof explainDifferentlyInputSchema>;

export const aiGradeTheoryInputSchema = z.object({
  questionId: uuidSchema,
  examId: uuidSchema,
  userAnswer: z.string().min(1).max(5000),
});
export type AiGradeTheoryInput = z.infer<typeof aiGradeTheoryInputSchema>;

export const tutorChatInputSchema = z.object({
  /**
   * The conversation history. We pass the FULL history each time rather
   * than persisting on the server — easier to debug, and matches how
   * Anthropic's API expects multi-turn input.
   * Limit to last 20 messages to keep input tokens bounded.
   */
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
  /**
   * Optional context: a question being discussed. The handler fetches the
   * question + the user's recent mistakes on its topic to ground the chat.
   */
  questionId: uuidSchema.optional(),
});
export type TutorChatInput = z.infer<typeof tutorChatInputSchema>;

export const studyPlanInputSchema = z.object({
  examId: uuidSchema,
  examDate: z.string().date(),
  hoursPerWeek: z.number().int().min(1).max(60),
});
export type StudyPlanInput = z.infer<typeof studyPlanInputSchema>;

export const adminGenerateQuestionsInputSchema = z.object({
  topicId: uuidSchema,
  count: z.number().int().min(1).max(15).default(10),
  difficultyHint: z.enum(['easier', 'harder', 'mixed']).default('mixed'),
});
export type AdminGenerateQuestionsInput = z.infer<typeof adminGenerateQuestionsInputSchema>;

export const aiFeedbackInputSchema = z.object({
  /**
   * The ai_usage_log row id returned by the AI endpoint that produced the
   * output the user is rating. The endpoint surfaces this in its JSON
   * response (or X-AI-Call-Id header for streaming endpoints).
   */
  aiUsageLogId: uuidSchema,
  rating: z.enum(['thumbs_up', 'thumbs_down']),
  /** Optional free-text explanation. Capped tightly. */
  comment: z.string().max(1000).optional(),
});
export type AiFeedbackInput = z.infer<typeof aiFeedbackInputSchema>;
