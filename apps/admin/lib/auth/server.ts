/**
 * Admin Supabase server client. Verifies the user's JWT and confirms
 * user_metadata.role === 'admin'.
 *
 * The admin app and the web app share a Supabase project, so the same
 * users.id is the same identity across both. Only users explicitly
 * granted role='admin' (set via service-role API by an existing admin)
 * can sign into the admin dashboard.
 */
import { createServerClient as _createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function createServerClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase env vars not set (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY)');
  }
  const cookieStore = cookies();

  return _createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          /* server component — cookies cannot be set here */
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          /* see above */
        }
      },
    },
  });
}

export type AdminAuthResult =
  | { ok: true; user: { id: string; email: string | null } }
  | { ok: false; reason: 'unauthenticated' | 'not_admin' };

export async function getAdminUser(): Promise<AdminAuthResult> {
  // Local dev shortcut: when DEV_AUTH_BYPASS=true, accept any session as admin.
  // Never set this in production.
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'unauthenticated' };

  const role =
    user.user_metadata && typeof user.user_metadata === 'object' && 'role' in user.user_metadata
      ? (user.user_metadata as { role?: string }).role
      : undefined;

  if (process.env.DEV_AUTH_BYPASS === 'true') {
    return { ok: true, user: { id: user.id, email: user.email ?? null } };
  }

  if (role !== 'admin') return { ok: false, reason: 'not_admin' };
  return { ok: true, user: { id: user.id, email: user.email ?? null } };
}
