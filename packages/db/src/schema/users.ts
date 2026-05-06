import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { subscriptionTierEnum } from './enums';

/**
 * users — profile linked 1:1 to auth.users (Supabase managed).
 *
 * `id` has no DEFAULT — it's populated by the on_auth_user_created trigger
 * from auth.users.id. The FK constraint to auth.users(id) ON DELETE CASCADE
 * is added in 0001_auth_link.sql (hand-written migration), since Drizzle
 * cannot reference tables outside the public schema.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    phone: varchar('phone', { length: 20 }).notNull(),
    email: varchar('email', { length: 320 }),
    fullName: varchar('full_name', { length: 200 }),
    age: smallint('age'),
    state: varchar('state', { length: 50 }),
    school: varchar('school', { length: 200 }),
    subscriptionTier: subscriptionTierEnum('subscription_tier').notNull().default('free'),
    subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
    whatsappOptedIn: boolean('whatsapp_opted_in').notNull().default(true),
    smsOptedIn: boolean('sms_opted_in').notNull().default(true),
    emailOptedIn: boolean('email_opted_in').notNull().default(true),
    preferredNotificationTime: time('preferred_notification_time')
      .notNull()
      .default('18:00:00'),
    timezone: varchar('timezone', { length: 50 }).notNull().default('Africa/Lagos'),
    parentUserId: uuid('parent_user_id'),
    referralCode: varchar('referral_code', { length: 20 }).notNull(),
    referredByUserId: uuid('referred_by_user_id'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    /**
     * Streak tracking — maintained by the daily streak-rollover cron.
     * `lastActiveDate` is the most recent calendar date (in user's tz) on
     * which they submitted an attempt. `streakDays` is the consecutive
     * count of dates leading up to (and including) lastActiveDate.
     */
    streakDays: smallint('streak_days').notNull().default(0),
    lastActiveDate: date('last_active_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneUnique: uniqueIndex('users_phone_unique').on(t.phone),
    // Email is nullable; default Postgres UNIQUE allows multiple NULLs (NULLS DISTINCT).
    // Locked in by the integration test in src/__tests__/users.test.ts.
    emailUnique: uniqueIndex('users_email_unique').on(t.email),
    referralCodeUnique: uniqueIndex('users_referral_code_unique').on(t.referralCode),
    parentIdx: index('users_parent_idx').on(t.parentUserId),
    expiringIdx: index('users_expiring_idx')
      .on(t.subscriptionExpiresAt)
      .where(sql`${t.subscriptionTier} <> 'free'`),
    ageCheck: check('users_age_check', sql`${t.age} IS NULL OR (${t.age} >= 13 AND ${t.age} <= 120)`),
  }),
);

/**
 * target_exams — many-to-many users↔exams with metadata (exam date, subjects, priority).
 */
export const targetExams = pgTable(
  'target_exams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    examId: uuid('exam_id').notNull(),
    examDate: date('exam_date'),
    subjectCombination: jsonb('subject_combination').$type<string[]>(),
    priority: smallint('priority').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userExamUnique: uniqueIndex('target_exams_user_exam_unique').on(t.userId, t.examId),
    userIdx: index('target_exams_user_idx').on(t.userId),
    dateIdx: index('target_exams_date_idx').on(t.examDate),
    priorityCheck: check(
      'target_exams_priority_check',
      sql`${t.priority} BETWEEN 1 AND 3`,
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type TargetExam = typeof targetExams.$inferSelect;
export type NewTargetExam = typeof targetExams.$inferInsert;
