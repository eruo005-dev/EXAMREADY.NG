import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { questionTypeEnum } from './enums';

export type MediaItem = {
  type: 'image' | 'diagram' | 'video';
  url: string;
  alt: string;
  caption?: string;
};

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    examId: uuid('exam_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    topicId: uuid('topic_id').notNull(),
    questionType: questionTypeEnum('question_type').notNull(),
    stem: text('stem').notNull(),
    passage: text('passage'),
    media: jsonb('media').$type<MediaItem[]>().notNull().default(sql`'[]'::jsonb`),
    difficulty: smallint('difficulty').notNull(),
    year: smallint('year'),
    source: varchar('source', { length: 100 }),
    explanation: text('explanation').notNull(),
    frequencyScore: smallint('frequency_score').notNull().default(50),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by'),
    /**
     * search_text is a Postgres GENERATED ALWAYS AS (...) STORED column.
     * App code never writes it. Meilisearch sync (later sprint) reads this
     * single field instead of concatenating client-side.
     */
    // STORED is the only mode Postgres supports for generated columns and is
    // what drizzle-kit emits by default. The generated migration confirms it.
    searchText: text('search_text').generatedAlwaysAs(
      sql`stem || ' ' || COALESCE(passage, '') || ' ' || COALESCE(explanation, '')`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    topicIdx: index('questions_topic_idx').on(t.topicId),
    subjectIdx: index('questions_subject_idx').on(t.subjectId),
    activePracticeIdx: index('questions_active_practice_idx')
      .on(t.isActive, t.examId, t.subjectId)
      .where(sql`${t.isActive} = true`),
    pastYearIdx: index('questions_past_year_idx')
      .on(t.year, t.examId)
      .where(sql`${t.year} IS NOT NULL`),
    frequencyIdx: index('questions_frequency_idx').on(t.frequencyScore),
    difficultyCheck: check(
      'questions_difficulty_check',
      sql`${t.difficulty} BETWEEN 1 AND 5`,
    ),
    frequencyCheck: check(
      'questions_frequency_check',
      sql`${t.frequencyScore} BETWEEN 0 AND 100`,
    ),
  }),
);

export const options = pgTable(
  'options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id').notNull(),
    label: varchar('label', { length: 2 }).notNull(),
    content: text('content').notNull(),
    isCorrect: boolean('is_correct').notNull().default(false),
    sortOrder: smallint('sort_order').notNull().default(0),
  },
  (t) => ({
    questionLabelUnique: uniqueIndex('options_question_label_unique').on(t.questionId, t.label),
    questionSortIdx: index('options_question_sort_idx').on(t.questionId, t.sortOrder),
  }),
);

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type Option = typeof options.$inferSelect;
export type NewOption = typeof options.$inferInsert;
