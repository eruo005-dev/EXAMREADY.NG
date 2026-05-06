import { defineRoute, ok } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({ auth: 'cron' })(async () => {
  return ok({ ok: true, todo: 'streak-rollover cron — daily midnight UTC' });
});
