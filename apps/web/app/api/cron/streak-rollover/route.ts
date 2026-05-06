/**
 * POST /api/cron/streak-rollover
 *
 * Daily midnight UTC. Recomputes streak_days + last_active_date for
 * every user with onboarding complete based on their attempts history.
 */
import { defineRoute, ok } from '@/lib/api/handler';
import { runStreakRollover } from '@/lib/cron/streak-rollover';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({ auth: 'cron' })(async () => {
  const result = await runStreakRollover(db, new Date());
  return ok(result);
});
