import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
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
    weakTopics: jsonb('weak_topics').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    plan: jsonb('plan').notNull(),
    generationInput: jsonb('generation_input').notNull().default(sql`'{}'::jsonb`),
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
 * No reference to the prompt or completion content — we don't store
 * those. The signal we need is "how many calls" not "what was said".
 */
export const aiUsageLog = pgTable(
  'ai_usage_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    feature: varchar('feature', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    durationMs: integer('duration_ms'),
    succeeded: boolean('succeeded').notNull().default(true),
    errorCode: varchar('error_code', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userFeatureDayIdx: index('ai_usage_user_feature_day_idx').on(
      t.userId,
      t.feature,
      t.createdAt.desc(),
    ),
    featureIdx: index('ai_usage_feature_idx').on(t.feature, t.createdAt.desc()),
  }),
);

export type AiUsageLogEntry = typeof aiUsageLog.$inferSelect;
export type NewAiUsageLogEntry = typeof aiUsageLog.$inferInsert;
