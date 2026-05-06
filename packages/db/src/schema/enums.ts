import { pgEnum } from 'drizzle-orm/pg-core';

export const subscriptionTierEnum = pgEnum('subscription_tier', ['free', 'basic', 'pro']);

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'basic_monthly',
  'pro_monthly',
  'pro_annual',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'cancelled',
  'grace',
  'expired',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'success',
  'failed',
  'refunded',
]);

export const questionTypeEnum = pgEnum('question_type', [
  'mcq_single',
  'mcq_multi',
  'true_false',
  'fill_blank',
  'theory',
  'comprehension',
  'diagram',
]);

export const attemptModeEnum = pgEnum('attempt_mode', [
  'quick_practice',
  'topic_drill',
  'past_year',
  'mock_cbt',
  'adaptive',
  'flashcard',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'whatsapp',
  'sms',
  'email',
  'push',
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
]);

export const groupRoleEnum = pgEnum('group_role', ['owner', 'member']);

export const referralStatusEnum = pgEnum('referral_status', [
  'pending',
  'qualified',
  'rewarded',
]);

/**
 * Exam coverage status — drives the Phase 1 vs future-launch separation.
 * `live` exams appear in the practice catalog. `coming_soon` and `planned`
 * exams show up only on /coming-soon and accept waitlist signups.
 */
export const coverageStatusEnum = pgEnum('coverage_status', [
  'live',
  'coming_soon',
  'planned',
]);
