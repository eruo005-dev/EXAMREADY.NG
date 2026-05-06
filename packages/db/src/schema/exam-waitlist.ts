import {
  bigserial,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * exam_waitlist — emails captured on the /coming-soon page when a visitor
 * asks to be notified about a planned exam launch (IELTS, SAT, ICAN, etc.).
 *
 * One row per (email, exam_slug) pair via UNIQUE — re-submitting the same
 * email for the same exam is a no-op via ON CONFLICT DO NOTHING. Different
 * exams from the same email are separate rows so we can email the right
 * subset when each launches.
 *
 * No FK to exams — we deliberately allow waitlist signups for slugs we
 * haven't seeded yet (e.g. user emailed asking about a niche professional
 * exam; we capture the demand signal, then add the exam later).
 */
export const examWaitlist = pgTable(
  'exam_waitlist',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    examSlug: varchar('exam_slug', { length: 80 }).notNull(),
    sourceUrl: varchar('source_url', { length: 500 }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailExamUnique: uniqueIndex('exam_waitlist_email_exam_unique').on(t.email, t.examSlug),
    examIdx: index('exam_waitlist_exam_idx').on(t.examSlug, t.createdAt.desc()),
    pendingNotifyIdx: index('exam_waitlist_pending_idx').on(t.examSlug),
  }),
);

export type ExamWaitlistEntry = typeof examWaitlist.$inferSelect;
export type NewExamWaitlistEntry = typeof examWaitlist.$inferInsert;
