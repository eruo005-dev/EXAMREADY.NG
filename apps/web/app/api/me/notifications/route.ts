import { eq } from 'drizzle-orm';

import { users } from '@examready/db/schema';
import { notificationPrefsInputSchema } from '@examready/shared';

import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  auth: 'user',
  bodySchema: notificationPrefsInputSchema,
})(async ({ parsed, user }) => {
  if (!user) throw new Error('user required');

  const updates: Partial<typeof users.$inferInsert> = {};
  if (parsed.whatsappOptedIn !== undefined) updates.whatsappOptedIn = parsed.whatsappOptedIn;
  if (parsed.smsOptedIn !== undefined) updates.smsOptedIn = parsed.smsOptedIn;
  if (parsed.emailOptedIn !== undefined) updates.emailOptedIn = parsed.emailOptedIn;
  if (parsed.preferredNotificationTime !== undefined) {
    updates.preferredNotificationTime = parsed.preferredNotificationTime;
  }
  if (parsed.timezone !== undefined) updates.timezone = parsed.timezone;

  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, user.profile.id));
  }

  const [refreshed] = await db.select().from(users).where(eq(users.id, user.profile.id));
  if (!refreshed) throw new Error('User vanished after update');

  return ok({
    user: {
      whatsappOptedIn: refreshed.whatsappOptedIn,
      smsOptedIn: refreshed.smsOptedIn,
      emailOptedIn: refreshed.emailOptedIn,
      preferredNotificationTime: refreshed.preferredNotificationTime,
      timezone: refreshed.timezone,
    },
  });
});
