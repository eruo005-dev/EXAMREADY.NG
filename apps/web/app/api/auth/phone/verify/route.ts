/**
 * POST /api/auth/phone/verify
 *
 * Validates the OTP via Supabase. On success, the on_auth_user_created
 * trigger has already populated public.users (if first-time auth), so
 * we fetch that profile row and return it alongside the session.
 */

import { users } from '@examready/db/schema';
import { verifyOtpSchema } from '@examready/shared';
import { eq } from 'drizzle-orm';

import { ApiError, defineRoute, ok, UnauthorizedError } from '@/lib/api/handler';
import { createServerClient } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { applyRateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'bypass', // We do a custom verify-specific rate limit below.
  bodySchema: verifyOtpSchema,
})(async ({ req, parsed }) => {
  const { phone, code } = parsed;

  // Verify-specific bucket: 10/phone/10min.
  const rl = await applyRateLimit('auth', {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0',
    phone,
    verifyContext: 'verify',
  });
  if (!rl.ok) {
    throw new ApiError('RATE_LIMITED', 'Too many verify attempts', 429, undefined, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });

  if (error || !data.user || !data.session) {
    throw new UnauthorizedError(error?.message ?? 'Invalid or expired code');
  }

  const profile = await db.query.users.findFirst({ where: eq(users.id, data.user.id) });
  if (!profile) {
    // Trigger should have created this. If we hit it the auth-link extras
    // migration didn't run on this Supabase project — flag it loudly.
    throw new ApiError(
      'INTERNAL_ERROR',
      'Profile row missing after auth — check 0001_auth_link.sql trigger',
      500,
    );
  }

  return ok({
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? 0,
    },
    user: {
      id: profile.id,
      phone: profile.phone,
      email: profile.email,
      fullName: profile.fullName,
      subscriptionTier: profile.subscriptionTier,
      onboardingCompleted: profile.onboardingCompletedAt !== null,
    },
    isNewUser: profile.onboardingCompletedAt === null,
  });
});
