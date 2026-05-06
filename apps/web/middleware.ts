/**
 * Edge middleware — minimal Sprint 0 implementation.
 *
 * Future use:
 * - Geo-routing: detect Nigerian IPs to default-render Naira pricing
 * - Redirect /dashboard etc. to /login when no session cookie present
 *
 * The (app) layout already does server-side session check + redirect, so
 * middleware redirects are only an optimization (avoid hitting the layout
 * just to bounce). Sprint 0 keeps the file in place but limited.
 */
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest): NextResponse {
  const res = NextResponse.next();

  // Identify Nigerian visitors — used by /pricing for currency hint and
  // by future ISR tags for geo-aware caching.
  const country = req.geo?.country ?? req.headers.get('x-vercel-ip-country');
  if (country) {
    res.headers.set('x-examready-country', country);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|api/health).*)'],
};
