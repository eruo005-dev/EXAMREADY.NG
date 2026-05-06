import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { attemptModeEnum } from './enums';

export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    mode: attemptModeEnum('mode').notNull(),
    examId: uuid('exam_id').notNull(),
    subjectId: uuid('subject_id'),
    topicId: uuid('topic_id'),
    totalQuestions: smallint('total_questions').notNull(),
    timeLimitSeconds: integer('time_limit_seconds'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    correctCount: smallint('correct_count'),
    accuracyPercent: numeric('accuracy_percent', { precision: 5, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    /**
     * Two narrow partial indexes — one for completed attempts (heatmap, history)
     * and one for in-progress (resume widget). Tighter and faster to maintain
     * than a single wide index.
     */
    userSubmittedIdx: index('attempts_user_submitted_idx')
      .on(t.userId, t.submittedAt.desc())
      .where(sql`${t.submittedAt} IS NOT NULL`),
    userInProgressIdx: index('attempts_user_in_progress_idx')
      .on(t.userId, t.startedAt.desc())
      .where(sql`${t.submittedAt} IS NULL`),
    userModeIdx: index('attempts_user_mode_idx').on(
      t.userId,
      t.mode,
      t.submittedAt.desc(),
    ),
    userSubjectIdx: index('attempts_user_subject_idx').on(
      t.userId,
      t.subjectId,
      t.submittedAt.desc(),
    ),
    totalCheck: check('attempts_total_check', sql`${t.totalQuestions} > 0`),
  }),
);

export const attemptAnswers = pgTable(
  'attempt_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id').notNull(),
    questionId: uuid('question_id').notNull(),
    selectedOptionIds: jsonb('selected_option_ids').$type<string[]>(),
    textAnswer: text('text_answer'),
    /**
     * NULL while the attempt is in progress. Computed in a single transaction
     * during POST /api/attempts/:id/submit. No other endpoint reads this
     * column for a non-submitted attempt.
     */
    isCorrect: boolean('is_correct'),
    timeSpentSeconds: integer('time_spent_seconds'),
    flagged: boolean('flagged').notNull().default(false),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (t) => ({
    attemptQuestionUnique: uniqueIndex('attempt_answers_attempt_question_unique').on(
      t.attemptId,
      t.questionId,
    ),
    attemptIdx: index('attempt_answers_attempt_idx').on(t.attemptId),
    questionCorrectIdx: index('attempt_answers_question_correct_idx').on(
      t.questionId,
      t.isCorrect,
    ),
    flaggedIdx: index('attempt_answers_flagged_idx')
      .on(t.attemptId)
      .where(sql`${t.flagged} = true`),
  }),
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    userId: uuid('user_id').notNull(),
    questionId: uuid('question_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.questionId] }),
    userCreatedIdx: index('bookmarks_user_created_idx').on(t.userId, t.createdAt.desc()),
  }),
);

export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type AttemptAnswer = typeof attemptAnswers.$inferSelect;
export type NewAttemptAnswer = typeof attemptAnswers.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
