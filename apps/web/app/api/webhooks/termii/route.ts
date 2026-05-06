/**
 * POST /api/webhooks/termii
 *
 * Sprint 0 stub. Real handler updates notification_log delivery state from
 * Termii's delivery receipts. Termii's signature scheme isn't well
 * documented as of writing — we'll add real verification when we wire up
 * the production Termii account.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const body = await req.text().catch(() => '');
  // eslint-disable-next-line no-console
  console.log('[termii] webhook received (stub):', body.slice(0, 500));
  return NextResponse.json({ received: true });
}
