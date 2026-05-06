/**
 * POST /api/webhooks/paystack
 *
 * Functional in Sprint 0 — verifies x-paystack-signature, parses the event,
 * and dispatches to the appropriate handler. Idempotent via paystack_reference
 * UNIQUE on payments and paystack_subscription_code UNIQUE on subscriptions.
 *
 * Returns bare 200 (no envelope) — Paystack expects 2xx, retries indefinitely
 * on non-2xx, and ignores body content.
 */
import { NextResponse } from 'next/server';

import {
  handleChargeSuccess,
  handleInvoicePaymentFailed,
  handleSubscriptionCreate,
  handleSubscriptionDisable,
  verifySignature,
  type PaystackEvent,
} from '@/lib/webhooks/paystack';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event.data as Parameters<typeof handleChargeSuccess>[0]);
        break;
      case 'subscription.create':
        await handleSubscriptionCreate(event.data as Parameters<typeof handleSubscriptionCreate>[0]);
        break;
      case 'subscription.disable':
      case 'subscription.not_renew':
        await handleSubscriptionDisable(event.data as Parameters<typeof handleSubscriptionDisable>[0]);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(
          event.data as Parameters<typeof handleInvoicePaymentFailed>[0],
        );
        break;
      default:
        // Unknown event — log + 200 so Paystack stops retrying.
        // eslint-disable-next-line no-console
        console.log('[paystack] Unhandled event:', event.event);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[paystack] Handler error:', err);
    // Return 500 so Paystack retries (transient failures shouldn't be lost).
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
