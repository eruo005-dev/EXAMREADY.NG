/**
 * Admin middleware — gates every (admin) route.
 *
 * The (admin) layout is a server component that calls getAdminUser() and
 * redirects on failure. This middleware is a lighter pre-check that
 * short-circuits unauthenticated requests at the edge before they hit any
 * RSC code. It uses only the JWT cookie presence — full role validation
 * happens in the layout.
 */
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/(admin)'];
// Note: in URLs the route group `(admin)` is stripped, so the actual
// paths are /dashboard, /questions, etc.
const URL_PROTECTED_PREFIXES = [
  '/dashboard',
  '/questions',
  '/users',
  '/moderation',
  '/broadcasts',
  '/bursaries',
];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const isProtected = URL_PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isProtected) return NextResponse.next();

  // Quick cookie check. The Supabase auth cookie name varies by project;
  // we look for any sb-*-auth-token cookie. The (admin) layout does the
  // full role validation server-side.
  const hasSupabaseCookie = req.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
  if (!hasSupabaseCookie) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};

// Marker to silence eslint for the unused PROTECTED_PREFIXES constant
// (kept for future direct-route-group matching once Next.js exposes it).
export const _internalGroupPaths = PROTECTED_PREFIXES;
