/**
 * Supabase server client — used by API routes and server components.
 * Reads the access token from cookies (the @supabase/ssr package handles
 * the cookie dance) and exposes auth.getUser() to verify the JWT.
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
          // Server components cannot set cookies; route handlers can.
          // Errors here are expected when called from a server component.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // See above.
        }
      },
    },
  });
}

/**
 * Service-role client for admin operations (calling auth.admin APIs,
 * bypassing RLS). Never expose this to the client. Only use in webhook
 * handlers, cron jobs, or admin endpoints.
 */
export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  return _createServerClient(SUPABASE_URL, serviceRoleKey, {
    cookies: {
      get: () => undefined,
      set: () => undefined,
      remove: () => undefined,
    },
  });
}
