import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * study_plans — AI-generated week-by-week study plans for a user.
 *
 * One user can have multiple plans over time (re-generated as exam date
 * approaches or weak topics shift). The most recent plan with
 * `is_current = true` is shown on the dashboard. Older plans are kept
 * for the user's history view + so we can compare predicted-vs-actual
 * once we have the analytics data to do so.
 *
 * `plan` is jsonb because the plan structure is intentionally flexible —
 * a 30-day cram plan and a 90-day prep plan have different shapes. The
 * Zod schema in @examready/shared/schemas/study-plan.ts is the source of
 * truth for the structure of `plan` at any given model version.
 *
 * `generation_input` captures everything we sent to Claude — exam_date,
 * weak_topics, hours_per_week, current accuracy. Useful for: (a) admin
 * debugging when a generated plan is bad, (b) regenerating with the
 * same input + a different model later, (c) telemetry on what kinds of
 * inputs produce useful plans.
 */
export const studyPlans = pgTable(
  'study_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    examId: uuid('exam_id').notNull(),
    examDate: date('exam_date'),
    hoursPerWeek: smallint('hours_per_week').notNull(),
    weakTopics: jsonb('weak_topics')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    plan: jsonb('plan').notNull(),
    generationInput: jsonb('generation_input')
      .notNull()
      .default(sql`'{}'::jsonb`),
    generatedByModel: varchar('generated_by_model', { length: 100 }).notNull(),
    isCurrent: boolean('is_current').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCurrentIdx: uniqueIndex('study_plans_user_current_unique')
      .on(t.userId, t.examId)
      .where(sql`${t.isCurrent} = true`),
    userCreatedIdx: index('study_plans_user_created_idx').on(t.userId, t.createdAt.desc()),
  }),
);

export type StudyPlan = typeof studyPlans.$inferSelect;
export type NewStudyPlan = typeof studyPlans.$inferInsert;

/**
 * ai_usage_log — append-only ledger of AI calls.
 *
 * Two purposes:
 * 1. Per-user rate limiting: count today's calls for this user/feature
 *    to enforce the free-tier daily caps (5/day tutor, 10/day explain).
 *    Redis is the primary rate-limit store; this table is the durable
 *    audit trail that survives Redis restarts and lets us detect abuse
 *    patterns across longer windows.
 * 2. Cost analytics: sum input_tokens × output_tokens across users to
 *    track Claude API spend per feature.
 *
 * Output samples are off by default. Set AI_LOG_SAMPLES=true on the
 * deployment to enable — a deliberate runtime switch the operator must
 * flip, NOT a schema default. When on, we store the model output (not
 * the user input) for the /admin/ai-quality-review surface. Output text
 * is run through redactPii before storage as defense-in-depth.
 *
 * Inputs are NEVER stored, regardless of AI_LOG_SAMPLES. Students may
 * paste their phone number into the tutor; that goes to Anthropic but
 * not into our database.
 */
export const aiUsageLog = pgTable(
  'ai_usage_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    feature: varchar('feature', { length: 50 }).notNull(),
    /**
     * Provider that fulfilled the call. Sprint 5 added DeepSeek alongside
     * Anthropic; older rows are 'anthropic' (the migration backfills).
     * Validate against the union at the application layer rather than a
     * pg_enum so adding a third provider is a one-line change.
     */
    provider: varchar('provider', { length: 20 }).notNull().default('anthropic'),
    model: varchar('model', { length: 100 }).notNull(),
    /**
     * Set to true when the primary provider failed and the fallback
     * provider satisfied the call. Tracks how often the primary is down
     * — if this trends > 1% per feature for a sustained window, that's
     * a signal to revisit the routing decision.
     */
    wasFallback: boolean('was_fallback').notNull().default(false),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    durationMs: integer('duration_ms'),
    succeeded: boolean('succeeded').notNull().default(true),
    errorCode: varchar('error_code', { length: 50 }),
    /**
     * Truncated, PII-redacted model output. NULL unless AI_LOG_SAMPLES=true
     * was set when the call was made. Capped at 4000 chars at write time.
     * Used solely by /admin/ai-quality-review to spot-check Pidgin
     * register, register drift, etc.
     */
    outputSample: text('output_sample'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userFeatureDayIdx: index('ai_usage_user_feature_day_idx').on(
      t.userId,
      t.feature,
      t.createdAt.desc(),
    ),
    featureIdx: index('ai_usage_feature_idx').on(t.feature, t.createdAt.desc()),
    samplesIdx: index('ai_usage_samples_idx')
      .on(t.feature, t.createdAt.desc())
      .where(sql`${t.outputSample} IS NOT NULL`),
  }),
);

export type AiUsageLogEntry = typeof aiUsageLog.$inferSelect;
export type NewAiUsageLogEntry = typeof aiUsageLog.$inferInsert;

/**
 * ai_feedback — students rate AI outputs thumbs up/down.
 *
 * The single most important signal we'll get post-launch about whether
 * the Pidgin variant (and the AI features in general) actually work.
 *
 * Linked to ai_usage_log so we can compute "per-feature thumbs ratio"
 * in admin analytics. Optional comment captures what went wrong when
 * the student bothers to type one — most won't, that's fine.
 *
 * One feedback per (user, ai_call) — UNIQUE constraint prevents
 * thumbs-spam. The frontend may toggle (thumbs-up → thumbs-down) by
 * upserting; that overwrites the prior decision rather than creating a
 * second row.
 */
export const aiFeedbackRatingEnum = pgEnum('ai_feedback_rating', ['thumbs_up', 'thumbs_down']);

export const aiFeedback = pgTable(
  'ai_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    aiUsageLogId: uuid('ai_usage_log_id').notNull(),
    rating: aiFeedbackRatingEnum('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCallUnique: uniqueIndex('ai_feedback_user_call_unique').on(t.userId, t.aiUsageLogId),
    callIdx: index('ai_feedback_call_idx').on(t.aiUsageLogId),
    ratingIdx: index('ai_feedback_rating_idx').on(t.rating, t.createdAt.desc()),
  }),
);

export type AiFeedbackEntry = typeof aiFeedback.$inferSelect;
export type NewAiFeedbackEntry = typeof aiFeedback.$inferInsert;
