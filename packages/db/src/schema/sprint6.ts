/**
 * Sprint 6 schema additions.
 *
 * Lives in its own file because the surface added in Sprint 6 doesn't
 * map cleanly onto the existing exam/question/attempt domains — these
 * are operational tables (job runs, theory grading attempts) that have
 * their own lifecycle.
 */
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * bulk_generation_jobs — one row per admin-triggered batch of question
 * generation. Rows are written when an admin POSTs to
 * /api/admin/questions/bulk-generate, then incrementally updated as the
 * QStash worker fires individual topic-level generation calls.
 *
 * Status flow:
 *   queued    → admin submitted; QStash messages enqueued
 *   running   → at least one worker is processing
 *   completed → all sub-jobs finished (some may have failed individually)
 *   failed    → catastrophic failure (e.g. all sub-jobs failed)
 *   cancelled → admin clicked the cancel button (Sprint 7 — not in 6)
 */
export const bulkGenerationStatusEnum = pgEnum('bulk_generation_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const bulkGenerationJobs = pgTable(
  'bulk_generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Admin user who triggered the job. */
    startedByUserId: uuid('started_by_user_id').notNull(),
    /** Single subject per job — keeps the unit of progress clear. */
    subjectId: uuid('subject_id').notNull(),
    /**
     * Difficulty distribution requested at trigger time. Stored as an
     * object e.g. { easy: 2, medium: 6, hard: 2 } where the values are
     * per-topic counts that sum to the count-per-topic the admin chose.
     */
    difficultyDistribution: jsonb('difficulty_distribution')
      .$type<{ easy: number; medium: number; hard: number }>()
      .notNull(),
    targetCountPerTopic: smallint('target_count_per_topic').notNull(),
    /** Number of QStash messages enqueued (equal to topic count for the subject at trigger time). */
    totalJobs: integer('total_jobs').notNull().default(0),
    completedJobs: integer('completed_jobs').notNull().default(0),
    failedJobs: integer('failed_jobs').notNull().default(0),
    /** Aggregate question count actually inserted across all sub-jobs. */
    questionsGenerated: integer('questions_generated').notNull().default(0),
    status: bulkGenerationStatusEnum('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Free-form notes — last error message, observations from the job. */
    notes: text('notes'),
  },
  (t) => ({
    statusIdx: index('bulk_generation_status_idx').on(t.status, t.startedAt.desc()),
    startedByIdx: index('bulk_generation_started_by_idx').on(t.startedByUserId, t.startedAt.desc()),
  }),
);

export type BulkGenerationJob = typeof bulkGenerationJobs.$inferSelect;
export type NewBulkGenerationJob = typeof bulkGenerationJobs.$inferInsert;

/**
 * theory_attempts — every AI-graded theory submission. Separate from
 * the existing `attempts` / `attempt_answers` tables because:
 *   1. Theory questions don't fit the option-selection model
 *   2. Each grading produces a structured AI response (JSON) we want to
 *      store verbatim for analytics + reviewer feedback
 *   3. Theory grading is rate-limited per its own daily cap
 *      (free 2/day, pro 20/day) — that lives on its own counter.
 *
 * `aiResponse` shape (validated by the route's Zod schema):
 *   {
 *     totalMarks: number,
 *     maxMarks: number,
 *     breakdown: [{ criterion, marksAwarded, maxMarks, feedback }],
 *     overallFeedback: string,
 *     suggestedImprovements: string[]
 *   }
 */
export const theoryAttempts = pgTable(
  'theory_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    questionId: uuid('question_id').notNull(),
    examId: uuid('exam_id').notNull(),
    /** The student's answer as submitted (raw text, max 5000 chars enforced at the API layer). */
    userAnswer: text('user_answer').notNull(),
    /** Structured AI grading result. See JSDoc above. */
    aiResponse: jsonb('ai_response').notNull(),
    /** Provider that fulfilled the call (deepseek / openai). Mirrors ai_usage_log.provider. */
    provider: varchar('provider', { length: 20 }).notNull(),
    /** Model that fulfilled the call. */
    model: varchar('model', { length: 100 }).notNull(),
    /** Convenience denormalised totals so the UI can render history without parsing JSON. */
    totalMarks: smallint('total_marks').notNull(),
    maxMarks: smallint('max_marks').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('theory_attempts_user_created_idx').on(t.userId, t.createdAt.desc()),
    questionIdx: index('theory_attempts_question_idx').on(t.questionId),
  }),
);

export type TheoryAttempt = typeof theoryAttempts.$inferSelect;
export type NewTheoryAttempt = typeof theoryAttempts.$inferInsert;
