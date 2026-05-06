import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { notificationChannelEnum, notificationStatusEnum } from './enums';

/**
 * notification_log — every WhatsApp / SMS / email / push send is logged here.
 *
 * Used for:
 * - Delivery receipt webhook updates (Termii / Resend)
 * - Per-user rate limiting ("max 2 non-transactional WhatsApp per day")
 * - Cron idempotency ("did we already send today's reminder for this user?")
 * - Admin audit trail
 *
 * payload stores template variables for debugging; secrets and OTP codes are
 * NEVER persisted here — the OTP delivery hook redacts them before logging.
 */
export const notificationLog = pgTable(
  'notification_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    templateKey: varchar('template_key', { length: 50 }).notNull(),
    status: notificationStatusEnum('status').notNull().default('queued'),
    providerMessageId: varchar('provider_message_id', { length: 200 }),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    userSentIdx: index('notification_log_user_sent_idx').on(t.userId, t.sentAt.desc()),
    providerMsgIdx: index('notification_log_provider_msg_idx').on(t.providerMessageId),
    rateLimitIdx: index('notification_log_rate_limit_idx').on(
      t.userId,
      t.channel,
      t.sentAt.desc(),
    ),
    statusIdx: index('notification_log_status_idx')
      .on(t.status, t.sentAt)
      .where(sql`${t.status} IN ('queued', 'sent')`),
  }),
);

export type NotificationLog = typeof notificationLog.$inferSelect;
export type NewNotificationLog = typeof notificationLog.$inferInsert;
