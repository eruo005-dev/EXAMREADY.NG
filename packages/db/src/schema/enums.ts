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
  // Sprint 7 — JAMB-fidelity CBT engine. `mock_cbt` is kept for backwards
  // compatibility with attempts created before Sprint 7; new flows go to
  // the more specific modes below.
  'cbt_mock_full', // 4-subject, JAMB-fidelity — exactly 180 questions, 120 min
  'cbt_mock_subject', // single-subject mock per exam_paper_specs config
  'past_paper', // user picks year + subject; SEO-friendly /past-papers/* lands here
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

export const referralStatusEnum = pgEnum('referral_status', ['pending', 'qualified', 'rewarded']);

/**
 * Exam coverage status — drives catalog visibility and labelling.
 *
 *  - `live`         : standard catalog presentation. Question pool is
 *                     verified-deep (>=1500 questions reviewed).
 *  - `beta`         : Sprint 6. Visible in catalog with a "BETA — content
 *                     growing weekly" badge. Practice still works; users
 *                     are told the pool is early-access.
 *  - `coming_soon`  : appears on /coming-soon with waitlist as the
 *                     primary CTA. Practice routes 404.
 *  - `planned`      : roadmap-only; doesn't appear anywhere user-facing.
 *  - `hidden`       : catalog filter omits these. Used for international
 *                     exams (IELTS/TOEFL/SAT/GRE/Duolingo) which are
 *                     out of scope for the Nigerian-launch positioning.
 */
export const coverageStatusEnum = pgEnum('coverage_status', [
  'live',
  'beta',
  'coming_soon',
  'planned',
  'hidden',
]);
