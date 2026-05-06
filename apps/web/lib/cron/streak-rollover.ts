/**
 * Streak rollover cron — fires daily at 00:00 UTC.
 *
 * For each user with onboarding complete, computes their current streak
 * by looking back through attempts.submitted_at and counting consecutive
 * calendar dates (in user's timezone) ending at the most recent active
 * day.
 *
 * Writes the result to users.streak_days and users.last_active_date so
 * the dashboard can read it cheaply without recomputing.
 *
 * Scales linearly with user count. For Sprint 1 this is fine; once we
 * have >50k active users we'll partition the job by user_id range.
 */
import { attempts, users } from '@examready/db/schema';
import { eq, isNotNull, sql } from 'drizzle-orm';


import type { Db } from '../db';

import { dateInTimezone } from './time';

export type StreakRolloverResult = {
  usersScanned: number;
  streaksUpdated: number;
  streaksReset: number;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Given a sorted-desc list of UNIQUE active dates (YYYY-MM-DD strings,
 * already converted to user's tz) and today's date, count consecutive
 * dates leading up to today or yesterday.
 *
 * Streak rules:
 * - If the most recent active date is today OR yesterday, the streak
 *   continues at that count.
 * - If the most recent active date is older than yesterday, streak = 0.
 * - Today's activity counts but doesn't break a streak that ended yesterday.
 */
export function computeStreak(activeDatesDesc: string[], today: string): number {
  if (activeDatesDesc.length === 0) return 0;

  const todayDate = new Date(`${today}T00:00:00Z`);
  const mostRecent = new Date(`${activeDatesDesc[0]}T00:00:00Z`);
  const daysSinceMostRecent = Math.round(
    (todayDate.getTime() - mostRecent.getTime()) / ONE_DAY_MS,
  );
  // If user hasn't been active for 2+ days, streak is broken.
  if (daysSinceMostRecent > 1) return 0;

  // Walk backward counting consecutive days.
  let streak = 1;
  for (let i = 1; i < activeDatesDesc.length; i += 1) {
    const prev = new Date(`${activeDatesDesc[i - 1]}T00:00:00Z`);
    const curr = new Date(`${activeDatesDesc[i]}T00:00:00Z`);
    const gap = Math.round((prev.getTime() - curr.getTime()) / ONE_DAY_MS);
    if (gap === 1) streak += 1;
    else break;
  }
  return streak;
}

export async function runStreakRollover(
  db: Db,
  nowUtc: Date,
): Promise<StreakRolloverResult> {
  const result: StreakRolloverResult = {
    usersScanned: 0,
    streaksUpdated: 0,
    streaksReset: 0,
  };

  // Pull every user with onboarding complete plus their attempt dates.
  // The aggregation happens in TS because date_trunc-with-timezone is
  // per-user (each user has their own tz) — running it in SQL would
  // require LATERAL joins per user which is uglier.
  const candidates = await db
    .select({
      id: users.id,
      timezone: users.timezone,
      currentStreak: users.streakDays,
    })
    .from(users)
    .where(isNotNull(users.onboardingCompletedAt));

  result.usersScanned = candidates.length;

  for (const user of candidates) {
    const today = dateInTimezone(nowUtc, user.timezone);

    // Fetch up to the last 60 days of attempt dates for this user, to keep
    // the streak computation bounded. A 60-day streak is already exceptional.
    const sixtyDaysAgo = new Date(nowUtc.getTime() - 60 * ONE_DAY_MS);
    const dateRows = await db
      .select({
        date: sql<string>`to_char(${attempts.submittedAt} AT TIME ZONE ${user.timezone}, 'YYYY-MM-DD')`,
      })
      .from(attempts)
      .where(eq(attempts.userId, user.id))
      .groupBy(
        sql`to_char(${attempts.submittedAt} AT TIME ZONE ${user.timezone}, 'YYYY-MM-DD')`,
      )
      .orderBy(
        sql`to_char(${attempts.submittedAt} AT TIME ZONE ${user.timezone}, 'YYYY-MM-DD') DESC`,
      );

    // Filter out attempts not yet submitted (sql returns null) and stale ones.
    const activeDates = dateRows
      .map((r) => r.date)
      .filter((d): d is string => d !== null && new Date(`${d}T00:00:00Z`) >= sixtyDaysAgo);

    const newStreak = computeStreak(activeDates, today);
    const lastActiveDate = activeDates[0] ?? null;

    if (newStreak !== user.currentStreak) {
      await db
        .update(users)
        .set({
          streakDays: newStreak,
          lastActiveDate,
        })
        .where(eq(users.id, user.id));
      if (newStreak === 0 && (user.currentStreak ?? 0) > 0) {
        result.streaksReset += 1;
      } else {
        result.streaksUpdated += 1;
      }
    } else if (lastActiveDate) {
      // Streak count unchanged but make sure last_active_date is current.
      await db
        .update(users)
        .set({ lastActiveDate })
        .where(eq(users.id, user.id));
    }
  }

  return result;
}
