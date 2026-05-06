/**
 * Upstash QStash wrapper — used for fan-out background jobs.
 *
 * Sprint 6 first user: `/api/admin/questions/bulk-generate` enqueues one
 * QStash message per topic, each fired against the worker route which
 * generates ~10 questions and writes to the moderation queue.
 *
 * Why QStash over a custom worker queue:
 *  - Vercel functions are stateless — long-running batches can't live in
 *    the request lifecycle (10s default, 60s max paid timeout).
 *  - QStash handles delivery, retries, deduplication, signature verification.
 *  - We pay per message; for admin-triggered batches the volume is bounded.
 */
import { Client, Receiver } from '@upstash/qstash';

let cachedClient: Client | null | undefined;
let cachedReceiver: Receiver | null | undefined;

export function getQStashClient(): Client | null {
  if (cachedClient !== undefined) return cachedClient;
  const token = process.env.UPSTASH_QSTASH_TOKEN;
  cachedClient = token ? new Client({ token }) : null;
  return cachedClient;
}

export function getQStashReceiver(): Receiver | null {
  if (cachedReceiver !== undefined) return cachedReceiver;
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) {
    cachedReceiver = null;
    return null;
  }
  cachedReceiver = new Receiver({ currentSigningKey: current, nextSigningKey: next });
  return cachedReceiver;
}

/**
 * Verify the inbound QStash signature on a worker endpoint. Returns true
 * iff the signature header is valid for the raw body. Worker handlers
 * MUST call this and reject (401) on false — without it, anyone can
 * fan out free generation calls against our DeepSeek key.
 */
export async function verifyQStashSignature(
  rawBody: string,
  signature: string | null,
  url: string,
): Promise<boolean> {
  if (!signature) return false;
  const receiver = getQStashReceiver();
  if (!receiver) return false;
  try {
    return await receiver.verify({ body: rawBody, signature, url });
  } catch {
    return false;
  }
}

export type EnqueueResult = { ok: true; messageId: string } | { ok: false; error: string };

/**
 * Send a JSON payload to the configured worker URL. Returns the
 * QStash message ID so callers can store it for traceability.
 */
export async function enqueue(
  workerUrl: string,
  payload: Record<string, unknown>,
): Promise<EnqueueResult> {
  const client = getQStashClient();
  if (!client) return { ok: false, error: 'QStash not configured' };
  try {
    const res = await client.publishJSON({ url: workerUrl, body: payload });
    return { ok: true, messageId: res.messageId };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message ?? err) };
  }
}
