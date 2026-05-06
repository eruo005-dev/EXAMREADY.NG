/**
 * Tiny fetch wrapper for the admin app to call the web app's API.
 *
 * In production, both apps share the parent domain (.examready.ng) so the
 * Supabase auth cookie is sent automatically. In local dev, admin runs at
 * :3001 and web at :3000 — the user signs into admin via the same Supabase
 * project, and the JWT is forwarded via Authorization header.
 */
'use client';

import { createClient } from './auth/client';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : '');

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown } };

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiOk<T> | ApiErr> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  return (await res.json()) as ApiOk<T> | ApiErr;
}
