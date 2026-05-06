/**
 * Integration test for runDailyReminders — confirms bucket logic +
 * notification_log idempotency together produce exactly ONE send across
 * four cron invocations near a user's preferred time.
 *
 * Per CHECKPOINT 3 decision 3: cron fires every 5 minutes with a
 * [now-2min, now+3min] bucket. The user spec for Task 3.4 calls out
 * 17:58/18:00/18:02/18:04 firings for a user with preferred_time=18:00 —
 * since the bucket is symmetrical, all four are within range, but the
 * notification_log idempotency check ensures only the first one fires.
 *
 * Skips if no test database is configured.
 */

import { createDb } from '@examready/db/client';
import { notificationLog } from '@examready/db/schema';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { runDailyReminders } from '../daily-reminders';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
const itOrSkip = url === null ? test.skip : test;

describe('runDailyReminders bucket + idempotency', () => {
  let db: ReturnType<typeof createDb>;
  let sql: postgres.Sql;
  let userId: string;

  beforeAll(async () => {
    if (!url) return;

    sql = postgres(url, { max: 1, prepare: false });
    db = createDb(url);

    // Reset the test user state. Schema is assumed already migrated by the
    // db package's setup; this test reuses the same database.
    await sql`DELETE FROM public.notification_log WHERE template_key = 'daily_reminder'`;
    await sql`DELETE FROM auth.users WHERE phone LIKE '+23488%'`;

    userId = (await sql<{ id: string }[]>`
      INSERT INTO auth.users (phone) VALUES (${'+2348800000001'}) RETURNING id
    `)[0]!.id;

    await sql`
      UPDATE public.users
      SET timezone = 'UTC',
          preferred_notification_time = '18:00:00',
          whatsapp_opted_in = true,
          email_opted_in = false,
          sms_opted_in = false,
          full_name = 'Test User',
          onboarding_completed_at = now()
      WHERE id = ${userId}
    `;
  });

  afterAll(async () => {
    if (sql) {
      await sql`DELETE FROM public.notification_log WHERE user_id = ${userId}`;
      await sql`DELETE FROM auth.users WHERE id = ${userId}`;
      await sql.end();
    }
  });

  itOrSkip('exactly one notification across 4 cron firings around 18:00', async () => {
    // User: timezone=UTC, preferred=18:00. Cron firings:
    //   t=17:58 UTC: bucket [17:56, 18:01]. preferred 18:00 → IN → fire (sends)
    //   t=18:00 UTC: bucket [17:58, 18:03]. preferred 18:00 → IN → idempotent skip
    //   t=18:02 UTC: bucket [18:00, 18:05]. preferred 18:00 → IN → idempotent skip
    //   t=18:04 UTC: bucket [18:02, 18:07]. preferred 18:00 → OUT → no fire
    const baseDate = '2026-05-06';

    const r1 = await runDailyReminders(db, new Date(`${baseDate}T17:58:00Z`), { dryRun: true });
    expect(r1.inBucket).toBe(1);
    expect(r1.alreadySentToday).toBe(0);
    expect(r1.sent).toBe(1); // dry-run counts a would-send as `sent`

    // For the next firings to actually exercise the idempotency check,
    // we need the FIRST fire to write to notification_log. Run it again
    // with dryRun=false so the log entry is created.
    await runDailyReminders(db, new Date(`${baseDate}T17:58:00Z`));
    // (This actually sends through Termii — on failure the log still
    // gets a 'failed' row, which still satisfies the idempotency check.)

    const r2 = await runDailyReminders(db, new Date(`${baseDate}T18:00:00Z`), { dryRun: true });
    expect(r2.inBucket).toBe(1);
    expect(r2.alreadySentToday).toBe(1);
    expect(r2.sent).toBe(0);

    const r3 = await runDailyReminders(db, new Date(`${baseDate}T18:02:00Z`), { dryRun: true });
    expect(r3.inBucket).toBe(1);
    expect(r3.alreadySentToday).toBe(1);
    expect(r3.sent).toBe(0);

    const r4 = await runDailyReminders(db, new Date(`${baseDate}T18:04:00Z`), { dryRun: true });
    expect(r4.inBucket).toBe(0);
    expect(r4.alreadySentToday).toBe(0);
    expect(r4.sent).toBe(0);

    // Sanity check: only one notification_log row for this user/template/day.
    const logs = await db
      .select({ id: notificationLog.id })
      .from(notificationLog)
      .where(eq(notificationLog.userId, userId));
    expect(logs.length).toBe(1);
  });

  itOrSkip('user in Africa/Lagos: matches at correct UTC time', async () => {
    // Update test user to Lagos timezone, preferred_time stays 18:00.
    // 18:00 Lagos = 17:00 UTC, so cron firing at 17:00 UTC must match.
    await sql`
      UPDATE public.users SET timezone = 'Africa/Lagos' WHERE id = ${userId}
    `;
    await sql`DELETE FROM public.notification_log WHERE user_id = ${userId}`;

    // Different calendar day to avoid colliding with the previous test.
    const baseDate = '2026-05-07';

    const out = await runDailyReminders(
      db,
      new Date(`${baseDate}T17:00:00Z`),
      { dryRun: true },
    );
    expect(out.inBucket).toBe(1);

    // Cron at 18:00 UTC = 19:00 Lagos. Out of bucket.
    const out2 = await runDailyReminders(
      db,
      new Date(`${baseDate}T18:00:00Z`),
      { dryRun: true },
    );
    expect(out2.inBucket).toBe(0);
  });
});
