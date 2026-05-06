import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { groupRoleEnum, referralStatusEnum } from './enums';

export const studyGroups = pgTable(
  'study_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    ownerUserId: uuid('owner_user_id').notNull(),
    examId: uuid('exam_id').notNull(),
    isPrivate: boolean('is_private').notNull().default(true),
    inviteCode: varchar('invite_code', { length: 20 }).notNull(),
    memberLimit: smallint('member_limit').notNull().default(20),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    inviteCodeUnique: uniqueIndex('study_groups_invite_code_unique').on(t.inviteCode),
    ownerIdx: index('study_groups_owner_idx').on(t.ownerUserId),
    examPrivateIdx: index('study_groups_exam_private_idx').on(t.examId, t.isPrivate),
    memberLimitCheck: check(
      'study_groups_member_limit_check',
      sql`${t.memberLimit} BETWEEN 2 AND 100`,
    ),
  }),
);

export const studyGroupMembers = pgTable(
  'study_group_members',
  {
    groupId: uuid('group_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: groupRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.userId] }),
    userIdx: index('study_group_members_user_idx').on(t.userId),
  }),
);

/**
 * ready_points_log — append-only ledger of points earned and reversed.
 *
 * Running balance is computed as SUM(points) WHERE user_id = ?. If this query
 * becomes hot we'll denormalize a `users.ready_points_balance` cache.
 *
 * Ready Points are NEVER redeemable for cash, gift cards, or any monetary
 * value — purely status. Enforced by absence of any redemption code.
 */
export const readyPointsLog = pgTable(
  'ready_points_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    points: integer('points').notNull(),
    reason: varchar('reason', { length: 50 }).notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('ready_points_user_created_idx').on(t.userId, t.createdAt.desc()),
    reasonIdx: index('ready_points_reason_idx').on(t.reason, t.createdAt),
  }),
);

export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referrerUserId: uuid('referrer_user_id').notNull(),
    referredUserId: uuid('referred_user_id').notNull(),
    status: referralStatusEnum('status').notNull().default('pending'),
    rewardDays: smallint('reward_days').notNull().default(0),
    qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
    rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairUnique: uniqueIndex('referrals_pair_unique').on(t.referrerUserId, t.referredUserId),
    referredIdx: index('referrals_referred_idx').on(t.referredUserId),
    referrerStatusIdx: index('referrals_referrer_status_idx').on(t.referrerUserId, t.status),
  }),
);

export type StudyGroup = typeof studyGroups.$inferSelect;
export type NewStudyGroup = typeof studyGroups.$inferInsert;
export type StudyGroupMember = typeof studyGroupMembers.$inferSelect;
export type ReadyPointsEntry = typeof readyPointsLog.$inferSelect;
export type NewReadyPointsEntry = typeof readyPointsLog.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
