/**
 * POST /api/auth/phone/resend
 *
 * User-controlled fallback. The OTP screen reveals "Send via SMS" after
 * 30s — tapping it calls this endpoint with channel='sms'. Re-fires
 * supabase.auth.signInWithOtp; the Send SMS Hook reads the channel hint
 * from a Redis flag we set here.
 *
 * Stricter rate limit (3/phone/10min) than initial request, since this
 * is the resend path.
 */
import { resendOtpSchema } from '@examready/shared';

import { ApiError, defineRoute, ForbiddenError, ok } from '@/lib/api/handler';
import { applyRateLimit } from '@/lib/ratelimit';
import { createServerClient } from '@/lib/auth/server';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'bypass',
  bodySchema: resendOtpSchema,
})(async ({ req, parsed }) => {
  const { phone, channel } = parsed;

  const rl = await applyRateLimit('auth', {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0',
    phone,
    verifyContext: 'resend',
  });
  if (!rl.ok) {
    throw new ApiError('RATE_LIMITED', 'Too many resend attempts', 429, undefined, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const redis = getRedis();
  if (redis) {
    const flag = await redis.get<string>(`otp:requested:${phone}`);
    if (!flag) {
      throw new ForbiddenError('No pending OTP for this phone — call request-otp first');
    }
    // Tell the Send SMS Hook which channel to prefer for this resend.
    await redis.set(`otp:channel-pref:${phone}`, channel, { ex: 60 * 5 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) {
    throw new ApiError('BAD_GATEWAY', `Auth provider error: ${error.message}`, 502);
  }

  return ok({ sent: true, channel });
});
