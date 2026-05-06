/**
 * POST /api/auth/google
 *
 * Trades a Google ID token (obtained client-side) for a Supabase session.
 * The on_auth_user_created trigger creates public.users on first sign-in.
 */
import { eq } from 'drizzle-orm';

import { users } from '@examready/db/schema';
import { googleSignInSchema } from '@examready/shared';

import { ApiError, defineRoute, ok, UnauthorizedError } from '@/lib/api/handler';
import { createServerClient } from '@/lib/auth/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'auth',
  bodySchema: googleSignInSchema,
})(async ({ parsed }) => {
  const supabase = createServerClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: parsed.idToken,
  });

  if (error || !data.user || !data.session) {
    throw new UnauthorizedError(error?.message ?? 'Google sign-in failed');
  }

  const profile = await db.query.users.findFirst({ where: eq(users.id, data.user.id) });
  if (!profile) {
    throw new ApiError(
      'INTERNAL_ERROR',
      'Profile row missing after Google sign-in — check 0001_auth_link.sql trigger',
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
