/**
 * POST /api/cron/daily-reminders — Sprint 0 stub.
 *
 * Real behavior: enumerate users in the [now-2min, now+3min] bucket where
 * preferred_notification_time matches, skip users who already received a
 * daily_reminder today (per their timezone), enqueue per-user QStash sends.
 */
import { defineRoute, ok } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({ auth: 'cron' })(async () => {
  return ok({ ok: true, todo: 'daily-reminders cron handler — implement in notifications sprint' });
});
