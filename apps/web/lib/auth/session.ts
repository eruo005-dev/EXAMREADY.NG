/**
 * getAuthedUser — the canonical "I need the user" call inside API routes
 * and server components.
 *
 * Returns BOTH the auth.users record (Supabase's view) and the public.users
 * profile row (our Drizzle row). The on_auth_user_created trigger guarantees
 * the profile row exists for any auth.users row, so a missing profile is an
 * internal error, not a 404.
 */
import { users, type User } from '@examready/db/schema';
import { eq } from 'drizzle-orm';

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
    throw new Error(
      `Profile missing for auth.users.id=${user.id} — check on_auth_user_created trigger`,
    );
  }
  return { authId: user.id, authEmail: user.email ?? null, profile };
}

export async function requireAdmin(req: Request): Promise<AuthedUser> {
  const authed = await getAuthedUser(req);

  // Sprint 6 admin gate: read role from `app_metadata.role`, NEVER from
  // `user_metadata.role`. Why this matters:
  //
  //  user_metadata is CLIENT-MUTABLE — any signed-in user can call
  //  supabase.auth.updateUser({ data: { role: 'admin' } }) and promote
  //  themselves. We made this mistake in Sprint 0; Sprint 6's audit
  //  caught it and migrated to app_metadata, which is server-only-
  //  writable (only callable from the service-role key).
  //
  // To make a user admin, an existing admin (or the operator with
  // service-role access) must call supabase.auth.admin.updateUserById(
  //   id, { app_metadata: { role: 'admin' } }
  // ). See LAUNCH_CHECKLIST.md.
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role =
    user?.app_metadata && typeof user.app_metadata === 'object' && 'role' in user.app_metadata
      ? (user.app_metadata as { role?: string }).role
      : undefined;

  if (role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  return authed;
}
