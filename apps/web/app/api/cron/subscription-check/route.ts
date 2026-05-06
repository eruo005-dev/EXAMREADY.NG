import { defineRoute, ok } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({ auth: 'cron' })(async () => {
  return ok({
    ok: true,
    todo: 'subscription-check cron — finds expired subscriptions, transitions grace -> expired, downgrades users.subscription_tier',
  });
});
