/**
 * POST /api/auth/phone/request-otp
 *
 * Triggers Supabase to generate an OTP and fire the Send SMS Hook —
 * which posts to /api/webhooks/supabase/send-sms, where we forward the
 * code to Termii (WhatsApp first, SMS sync-fallback if not on WhatsApp).
 *
 * Rate limit: 5/phone/10min AND 20/IP/hour (composite). Both must pass
 * BEFORE supabase.auth.signInWithOtp is called — protects Termii bill.
 *
 * The handler does NOT directly call Termii. The Send SMS Hook does that
 * once Supabase generates the code. Centralising Termii calls in
 * packages/notifications via a single hook entry point.
 */
import { requestOtpSchema } from '@examready/shared';

import { ApiError, defineRoute, ok } from '@/lib/api/handler';
import { createServerClient } from '@/lib/auth/server';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'auth',
  bodySchema: requestOtpSchema,
})(async ({ parsed }) => {
  const { phone } = parsed;

  // Set a Redis flag to gate the verify endpoint — proves the user
  // actually started the OTP flow before they can call verify/resend.
  const redis = getRedis();
  if (redis) {
    await redis.set(`otp:requested:${phone}`, '1', { ex: 60 * 10 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: {
      // Channel hint for our Send SMS Hook to route via WhatsApp.
      // The hook reads this from request headers since Supabase doesn't
      // forward auth options. We instead default to WhatsApp in the hook.
      shouldCreateUser: true,
    },
  });

  if (error) {
    throw new ApiError('BAD_GATEWAY', `Auth provider error: ${error.message}`, 502);
  }

  // The "channel actually attempted" is best-effort — we can't see the
  // hook's outcome from this handler. We default to WhatsApp because that's
  // what the hook tries first. Frontend uses this only for UI copy.
  return ok({ sent: true, channel: 'whatsapp', expiresInSeconds: 600 });
});
