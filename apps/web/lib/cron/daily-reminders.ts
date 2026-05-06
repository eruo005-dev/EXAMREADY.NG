/**
 * Daily reminders cron — fired every 5 minutes.
 *
 * For each opted-in user whose preferred_notification_time falls in
 * [now-2min, now+3min] (in their timezone), and who has NOT already
 * received a daily_reminder today (in their timezone), enqueue a send.
 *
 * Idempotency check is per-user-per-day-in-user-tz so late cron fires
 * never double-send. notification_log is the source of truth.
 *
 * This module exposes runDailyReminders() as a pure function the cron
 * route handler calls, which makes it unit-testable with simulated
 * `now` values.
 */

import { notificationLog, users } from '@examready/db/schema';
import { send } from '@examready/notifications';
import { and, eq, isNotNull, or, sql } from 'drizzle-orm';

import type { Db } from '../db';

import { dateInTimezone, isUserInBucket } from './time';

export type DailyReminderResult = {
  candidatesScanned: number;
  inBucket: number;
  alreadySentToday: number;
  sent: number;
  failed: number;
};

type CandidateUser = {
  id: string;
  fullName: string | null;
  phone: string;
  email: string | null;
  whatsappOptedIn: boolean;
  smsOptedIn: boolean;
  emailOptedIn: boolean;
  timezone: string;
  preferredNotificationTime: string;
};

/**
 * Already-sent check: did this user receive `daily_reminder` already on
 * the calendar date that `nowUtc` falls on IN THEIR TIMEZONE?
 */
async function hasReceivedToday(
  db: Db,
  userId: string,
  templateKey: string,
  todayInUserTz: string,
  userTimezone: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.userId, userId),
        eq(notificationLog.templateKey, templateKey),
        sql`date_trunc('day', ${notificationLog.sentAt} AT TIME ZONE ${userTimezone}) = ${todayInUserTz}::timestamp`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function runDailyReminders(
  db: Db,
  nowUtc: Date,
  options: {
    /** Send no actual notifications — just compute who would be sent to. For tests + audits. */
    dryRun?: boolean;
  } = {},
): Promise<DailyReminderResult> {
  const result: DailyReminderResult = {
    candidatesScanned: 0,
    inBucket: 0,
    alreadySentToday: 0,
    sent: 0,
    failed: 0,
  };

  // Pull the candidate set: users who completed onboarding and have at
  // least one channel opt-in. The 5-minute cadence + ~5min bucket means
  // we scan the full opted-in set every fire, which is fine up to ~50k
  // users; beyond that we'd partition by timezone.
  const candidates: CandidateUser[] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      phone: users.phone,
      email: users.email,
      whatsappOptedIn: users.whatsappOptedIn,
      smsOptedIn: users.smsOptedIn,
      emailOptedIn: users.emailOptedIn,
      timezone: users.timezone,
      preferredNotificationTime: users.preferredNotificationTime,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.onboardingCompletedAt),
        or(
          eq(users.whatsappOptedIn, true),
          eq(users.smsOptedIn, true),
          eq(users.emailOptedIn, true),
        ),
      ),
    );

  result.candidatesScanned = candidates.length;

  for (const user of candidates) {
    const inBucket = isUserInBucket({
      nowUtc,
      userTimezone: user.timezone,
      preferredTime: user.preferredNotificationTime,
    });
    if (!inBucket) continue;
    result.inBucket += 1;

    const today = dateInTimezone(nowUtc, user.timezone);
    const alreadySent = await hasReceivedToday(
      db,
      user.id,
      'daily_reminder',
      today,
      user.timezone,
    );
    if (alreadySent) {
      result.alreadySentToday += 1;
      continue;
    }

    if (options.dryRun) {
      result.sent += 1;
      continue;
    }

    // Pick channel: WhatsApp first (matches CHECKPOINT 3), email as
    // fallback if WA opt-out. Skip SMS for non-transactional.
    const primaryChannel: 'whatsapp' | 'email' | null = user.whatsappOptedIn
      ? 'whatsapp'
      : user.emailOptedIn
        ? 'email'
        : null;
    if (!primaryChannel) continue;

    const firstName = user.fullName?.split(' ')[0] ?? 'there';
    const sendResult = await send({
      templateKey: 'daily_reminder',
      to: { phone: user.phone, email: user.email ?? undefined },
      channel: primaryChannel,
      vars: {
        '1': firstName,
        '2': '0', // weak topic count — TODO when streak/heatmap fully wired
        '3': 'your subjects',
        '4': process.env.PUBLIC_BASE_URL ?? 'https://examready.ng',
      },
    });

    // Always log the attempt — the idempotency check reads notification_log
    // regardless of success/failure, so a failed send still prevents duplicate
    // attempts within the same day's bucket window.
    await db.insert(notificationLog).values({
      userId: user.id,
      channel: sendResult.channelUsed ?? primaryChannel,
      templateKey: 'daily_reminder',
      status: sendResult.ok ? 'sent' : 'failed',
      providerMessageId: sendResult.providerMessageId,
      errorMessage: sendResult.errorMessage,
      payload: { fellBackTo: sendResult.fellBackTo, dailyReminder: true },
    });

    if (sendResult.ok) {
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}
