/**
 * POST /api/webhooks/supabase/send-sms
 *
 * Supabase Auth's "Send SMS Hook" — invoked when GoTrue needs to deliver
 * an OTP. We forward the code to Termii via packages/notifications,
 * trying WhatsApp first (Termii sync-rejects non-WA numbers immediately,
 * which we catch and retry as SMS in the same request).
 *
 * Signature: Supabase uses Standard Webhooks v1. The hook secret is set
 * in the Supabase dashboard and stored in SUPABASE_AUTH_HOOK_SECRET.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { send } from '@examready/notifications';
import { supabaseSendSmsHookSchema } from '@examready/shared';

import { notificationLog } from '@examready/db/schema';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { users } from '@examready/db/schema';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

function verifyStandardWebhook(
  rawBody: string,
  msgId: string | null,
  timestamp: string | null,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!secret || !msgId || !timestamp || !signatureHeader) return false;

  // Standard Webhooks v1: sign(msgId.timestamp.body) with base64-decoded secret.
  // Supabase's secret is prefixed with v1,whsec_ — strip both prefixes.
  let secretMaterial = secret;
  if (secretMaterial.startsWith('v1,whsec_')) {
    secretMaterial = secretMaterial.slice('v1,whsec_'.length);
  } else if (secretMaterial.startsWith('whsec_')) {
    secretMaterial = secretMaterial.slice('whsec_'.length);
  }

  let key: Buffer;
  try {
    key = Buffer.from(secretMaterial, 'base64');
  } catch {
    return false;
  }

  const signedPayload = `${msgId}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', key).update(signedPayload).digest('base64');

  // The header may include multiple "v1,sig" entries separated by spaces.
  const candidates = signatureHeader
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1,'))
    .map((s) => s.slice('v1,'.length));

  const expectedBuf = Buffer.from(expected);
  return candidates.some((sig) => {
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length !== expectedBuf.length) return false;
    try {
      return timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const ok = verifyStandardWebhook(
    rawBody,
    req.headers.get('webhook-id'),
    req.headers.get('webhook-timestamp'),
    req.headers.get('webhook-signature'),
  );
  if (!ok) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: ReturnType<typeof supabaseSendSmsHookSchema.parse>;
  try {
    payload = supabaseSendSmsHookSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    return NextResponse.json({ error: 'Invalid payload', details: String(err) }, { status: 400 });
  }

  // Channel preference: if the user just hit /resend with channel=sms,
  // we honour that. Otherwise default to WhatsApp.
  const redis = getRedis();
  let preferredChannel: 'whatsapp' | 'sms' = 'whatsapp';
  if (redis) {
    const pref = await redis.get<string>(`otp:channel-pref:${payload.user.phone}`);
    if (pref === 'sms') preferredChannel = 'sms';
  }

  const result = await send({
    templateKey: 'otp_code',
    to: { phone: payload.user.phone },
    channel: preferredChannel,
    fallback: preferredChannel === 'whatsapp' ? 'sms' : undefined,
    vars: { '1': payload.sms.otp },
  });

  // Log to notification_log if we can resolve the user.
  if (payload.user.id || result.providerMessageId) {
    let userId = payload.user.id;
    if (!userId) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phone, payload.user.phone))
        .limit(1);
      userId = u?.id;
    }
    if (userId) {
      await db.insert(notificationLog).values({
        userId,
        channel: result.channelUsed ?? 'whatsapp',
        templateKey: 'otp_code',
        status: result.ok ? 'sent' : 'failed',
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage,
        // OTP code itself is NOT logged — only the attempt metadata.
        payload: { fellBackTo: result.fellBackTo },
      });
    }
  }

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error('[supabase/send-sms] OTP delivery failed:', result.errorMessage);
    return NextResponse.json({ error: 'Delivery failed' }, { status: 502 });
  }

  return NextResponse.json({});
}
