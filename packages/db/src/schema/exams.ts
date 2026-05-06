import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { coverageStatusEnum } from './enums';

export const exams = pgTable(
  'exams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 50 }).notNull(),
    description: text('description'),
    iconUrl: text('icon_url'),
    isActive: boolean('is_active').notNull().default(true),
    coverageStatus: coverageStatusEnum('coverage_status').notNull().default('live'),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('exams_slug_unique').on(t.slug),
    activeSortIdx: index('exams_active_sort_idx').on(t.isActive, t.sortOrder),
    coverageIdx: index('exams_coverage_idx').on(t.coverageStatus),
  }),
);

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    examId: uuid('exam_id').notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    iconUrl: text('icon_url'),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    examSlugUnique: uniqueIndex('subjects_exam_slug_unique').on(t.examId, t.slug),
    examSortIdx: index('subjects_exam_sort_idx').on(t.examId, t.sortOrder),
  }),
);

export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id').notNull(),
    parentTopicId: uuid('parent_topic_id'),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 200 }).notNull(),
    description: text('description'),
    frequencyScore: smallint('frequency_score').notNull().default(50),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    subjectSlugUnique: uniqueIndex('topics_subject_slug_unique').on(t.subjectId, t.slug),
    subjectSortIdx: index('topics_subject_sort_idx').on(t.subjectId, t.sortOrder),
    parentIdx: index('topics_parent_idx').on(t.parentTopicId),
    frequencyCheck: check(
      'topics_frequency_check',
      sql`${t.frequencyScore} BETWEEN 0 AND 100`,
    ),
  }),
);

export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
