/**
 * Weekly summary cron — fires Sunday 19:00 UTC (= 20:00 WAT).
 *
 * For each opted-in user, computes their past-7-day stats (questions
 * answered, accuracy, attempts) and sends a summary via WhatsApp/email.
 * Idempotency: one summary per user per ISO week.
 */

import { attemptAnswers, attempts, notificationLog, users } from '@examready/db/schema';
import { send } from '@examready/notifications';
import { and, between, eq, isNotNull, or, sql } from 'drizzle-orm';

import type { Db } from '../db';

import { dateInTimezone } from './time';

export type WeeklySummaryResult = {
  candidatesScanned: number;
  alreadySentThisWeek: number;
  sent: number;
  failed: number;
};

/**
 * ISO week identifier (e.g. "2026-W18") — the same string for every day
 * within the same Mon-Sun week. We use this as the idempotency key.
 */
function isoWeekId(date: Date, timezone: string): string {
  // Compute the date in the user's timezone, then derive ISO week.
  const dateStr = dateInTimezone(date, timezone);
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const localDate = new Date(Date.UTC(
    parseInt(yearStr!, 10),
    parseInt(monthStr!, 10) - 1,
    parseInt(dayStr!, 10),
  ));
  // Move to nearest Thursday (ISO week algorithm).
  const dayNum = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - dayNum + 3);
  const firstThursday = localDate.getTime();
  localDate.setUTCMonth(0, 1);
  if (localDate.getUTCDay() !== 4) {
    localDate.setUTCMonth(0, 1 + ((4 - localDate.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - localDate.getTime()) / 604_800_000);
  return `${yearStr}-W${String(weekNumber).padStart(2, '0')}`;
}

export async function runWeeklySummary(
  db: Db,
  nowUtc: Date,
  options: { dryRun?: boolean } = {},
): Promise<WeeklySummaryResult> {
  const result: WeeklySummaryResult = {
    candidatesScanned: 0,
    alreadySentThisWeek: 0,
    sent: 0,
    failed: 0,
  };

  const candidates = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      phone: users.phone,
      email: users.email,
      whatsappOptedIn: users.whatsappOptedIn,
      emailOptedIn: users.emailOptedIn,
      timezone: users.timezone,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.onboardingCompletedAt),
        or(eq(users.whatsappOptedIn, true), eq(users.emailOptedIn, true)),
      ),
    );

  result.candidatesScanned = candidates.length;
  const weekStart = new Date(nowUtc.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const user of candidates) {
    const weekId = isoWeekId(nowUtc, user.timezone);

    // Idempotency: was a weekly_summary already sent to this user with the
    // same ISO week id (in the payload metadata)?
    const existing = await db
      .select({ id: notificationLog.id })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.userId, user.id),
          eq(notificationLog.templateKey, 'weekly_summary'),
          sql`${notificationLog.payload}->>'weekId' = ${weekId}`,
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      result.alreadySentThisWeek += 1;
      continue;
    }

    // Aggregate the user's past-7-day stats.
    const stats = await db
      .select({
        questions: sql<number>`count(${attemptAnswers.id})::int`,
        correct: sql<number>`sum(case when ${attemptAnswers.isCorrect} then 1 else 0 end)::int`,
      })
      .from(attempts)
      .leftJoin(attemptAnswers, eq(attemptAnswers.attemptId, attempts.id))
      .where(
        and(
          eq(attempts.userId, user.id),
          isNotNull(attempts.submittedAt),
          between(attempts.submittedAt, weekStart, nowUtc),
        ),
      );

    const questions = stats[0]?.questions ?? 0;
    const correct = stats[0]?.correct ?? 0;
    if (questions === 0) continue; // No activity — skip the summary entirely.

    const accuracyPct = Math.round((correct / questions) * 100);

    if (options.dryRun) {
      result.sent += 1;
      continue;
    }

    const channel: 'whatsapp' | 'email' = user.whatsappOptedIn ? 'whatsapp' : 'email';
    const sendResult = await send({
      templateKey: 'weekly_summary',
      to: { phone: user.phone, email: user.email ?? undefined },
      channel,
      vars: {
        '1': String(questions),
        '2': String(accuracyPct),
        '3': '50', // peer percentile placeholder — needs real query in a later sprint
        '4': 'JAMB',
      },
    });

    await db.insert(notificationLog).values({
      userId: user.id,
      channel: sendResult.channelUsed ?? channel,
      templateKey: 'weekly_summary',
      status: sendResult.ok ? 'sent' : 'failed',
      providerMessageId: sendResult.providerMessageId,
      errorMessage: sendResult.errorMessage,
      payload: { weekId, questions, accuracyPct },
    });

    if (sendResult.ok) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}
