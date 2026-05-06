/**
 * POST /api/cron/daily-reminders
 *
 * Fires every 5 minutes via Vercel Cron. For each opted-in user whose
 * preferred_notification_time falls within [now-2min, now+3min] in their
 * timezone (and who hasn't already received today's daily_reminder),
 * sends the WhatsApp/email reminder.
 *
 * Bucket logic + idempotency are unit-tested in
 * apps/web/__tests__/cron-daily-reminders.test.ts.
 */
import { defineRoute, ok } from '@/lib/api/handler';
import { runDailyReminders } from '@/lib/cron/daily-reminders';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({ auth: 'cron' })(async () => {
  const result = await runDailyReminders(db, new Date());
  return ok(result);
});
