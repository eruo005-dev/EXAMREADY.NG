/**
 * POST /api/admin/notifications/test — admin-only test send.
 *
 * Bypasses the user's opt-in flags (it's a test tool). Logs to
 * notification_log with template_key prefixed `_test:` so analytics can
 * filter test traffic out.
 */
import { eq } from 'drizzle-orm';

import { notificationLog, users } from '@examready/db/schema';
import { send } from '@examready/notifications';
import { adminTestNotificationSchema } from '@examready/shared';

import { defineRoute, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'admin',
  bodySchema: adminTestNotificationSchema,
})(async ({ parsed }) => {
  const [target] = await db
    .select({ phone: users.phone, email: users.email })
    .from(users)
    .where(eq(users.id, parsed.userId))
    .limit(1);
  if (!target) throw new NotFoundError('User not found');

  const result = await send({
    templateKey: parsed.templateKey,
    to: { phone: target.phone, email: target.email ?? undefined },
    channel: parsed.channel,
    fallback: parsed.channel === 'whatsapp' ? 'sms' : undefined,
    vars: parsed.vars,
  });

  await db.insert(notificationLog).values({
    userId: parsed.userId,
    channel: result.channelUsed ?? parsed.channel,
    templateKey: `_test:${parsed.templateKey}`,
    status: result.ok ? 'sent' : 'failed',
    providerMessageId: result.providerMessageId,
    errorMessage: result.errorMessage,
    payload: { vars: parsed.vars, fellBackTo: result.fellBackTo },
  });

  return ok({
    messageId: result.providerMessageId ?? null,
    channel: result.channelUsed ?? null,
    ok: result.ok,
  });
});
