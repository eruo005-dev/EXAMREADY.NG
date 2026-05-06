/**
 * QStash scheduling helper — defers notification sends to a future time.
 *
 * Used by the daily-reminder cron: instead of "look up every user with
 * preferred_time=now and fire" (slow at scale), the cron enumerates users
 * and enqueues a QStash message scheduled at their per-user time. QStash
 * delivers the message back to /api/cron/_qstash with the payload, which
 * then calls send() once.
 *
 * In Sprint 0 the QStash handler endpoint is a stub. The scheduling helper
 * is wired so cron handlers (also stubs in Sprint 0) compile against it.
 */
import type { TemplateKey } from '@examready/shared';
import { Client } from '@upstash/qstash';

import type { Channel } from './send';

export type ScheduledNotification = {
  userId: string;
  templateKey: TemplateKey;
  channel: Channel;
  fallback?: Channel;
  vars: Record<string, string>;
  /** Absolute Unix timestamp (seconds) to deliver at. */
  notBefore: number;
};

let cachedClient: Client | null = null;

function getClient(): Client {
  if (cachedClient) return cachedClient;
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    throw new Error('QSTASH_TOKEN not configured');
  }
  cachedClient = new Client({ token });
  return cachedClient;
}

/**
 * Enqueue a single notification for future delivery.
 *
 * The QStash callback URL is constructed from VERCEL_URL + a fixed path
 * we don't expose to clients (verified by HMAC signature in the handler).
 */
export async function scheduleNotification(
  notification: ScheduledNotification,
): Promise<{ messageId: string }> {
  const baseUrl =
    process.env.VERCEL_URL !== undefined && process.env.VERCEL_URL !== ''
      ? `https://${process.env.VERCEL_URL}`
      : process.env.PUBLIC_BASE_URL;

  if (!baseUrl) {
    throw new Error('VERCEL_URL or PUBLIC_BASE_URL must be set for QStash callbacks');
  }

  const client = getClient();
  const result = await client.publishJSON({
    url: `${baseUrl}/api/internal/qstash/notification`,
    body: notification,
    notBefore: notification.notBefore,
    retries: 3,
  });

  return { messageId: result.messageId };
}
