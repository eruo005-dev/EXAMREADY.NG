/**
 * POST /api/cron/subscription-check
 *
 * Hourly. Transitions subscriptions past their period end:
 * active → grace, grace → expired (with user downgrade + notification).
 */
import { defineRoute, ok } from '@/lib/api/handler';
import { runSubscriptionCheck } from '@/lib/cron/subscription-check';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({ auth: 'cron' })(async () => {
  const result = await runSubscriptionCheck(db, new Date());
  return ok(result);
});
