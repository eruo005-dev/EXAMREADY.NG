/**
 * getAuthedUser — the canonical "I need the user" call inside API routes
 * and server components.
 *
 * Returns BOTH the auth.users record (Supabase's view) and the public.users
 * profile row (our Drizzle row). The on_auth_user_created trigger guarantees
 * the profile row exists for any auth.users row, so a missing profile is an
 * internal error, not a 404.
 */
import { eq } from 'drizzle-orm';

import { users, type User } from '@examready/db/schema';

import { db } from '../db';

import { createServerClient } from './server';

export type AuthedUser = {
  authId: string;
  authEmail: string | null;
  profile: User;
};

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'Sign in required') {
    super(message);
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message = 'You do not have access to this resource') {
    super(message);
  }
}

/**
 * Dev-only auth bypass: when DEV_AUTH_BYPASS=true, accept an
 * `x-dev-user-id` header in place of a real session. Lets the frontend
 * make authenticated calls before the Termii / Supabase staging stack is
 * wired up.
 */
async function devBypass(req: Request): Promise<AuthedUser | null> {
  if (process.env.DEV_AUTH_BYPASS !== 'true') return null;
  const headerId = req.headers.get('x-dev-user-id');
  if (!headerId) return null;
  const profile = await db.query.users.findFirst({ where: eq(users.id, headerId) });
  if (!profile) throw new UnauthorizedError('Dev bypass: user-id not found in users table');
  return { authId: profile.id, authEmail: profile.email, profile };
}

export async function getAuthedUser(req: Request): Promise<AuthedUser> {
  const dev = await devBypass(req);
  if (dev) return dev;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();

  const profile = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!profile) {
    // Trigger should have created this row. If we hit this, something has
    // gone wrong with the auth-link migration in this environment.
    throw new Error(`Profile missing for auth.users.id=${user.id} — check on_auth_user_created trigger`);
  }
  return { authId: user.id, authEmail: user.email ?? null, profile };
}

export async function requireAdmin(req: Request): Promise<AuthedUser> {
  const authed = await getAuthedUser(req);

  // Sprint 0 admin gate: a Supabase user_metadata.role claim of 'admin'.
  // The admin app dashboard sets this via the service-role API.
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role =
    user?.user_metadata && typeof user.user_metadata === 'object' && 'role' in user.user_metadata
      ? (user.user_metadata as { role?: string }).role
      : undefined;

  if (role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  return authed;
}
