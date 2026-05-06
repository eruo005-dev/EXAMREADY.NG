/**
 * POST /api/cron/weekly-summary
 *
 * Vercel Cron fires Sunday 19:00 UTC (= 20:00 WAT). Sends each user
 * their past-7-day stats summary, idempotent on ISO week.
 */
import { defineRoute, ok } from '@/lib/api/handler';
import { runWeeklySummary } from '@/lib/cron/weekly-summary';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({ auth: 'cron' })(async () => {
  const result = await runWeeklySummary(db, new Date());
  return ok(result);
});
