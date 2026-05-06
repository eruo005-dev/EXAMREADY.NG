/**
 * Paystack webhook helpers — signature verification + idempotent state mutations.
 *
 * Verification: HMAC-SHA512 of the raw request body with PAYSTACK_SECRET_KEY,
 * compared (timing-safe) against the x-paystack-signature header.
 *
 * Sprint 0 events handled:
 *   charge.success           — record payments row, then verify via API call
 *   subscription.create      — upsert subscription, set users.subscription_tier
 *   subscription.disable     — flip status to 'cancelled', schedule downgrade
 *   subscription.not_renew   — same as disable
 *   invoice.payment_failed   — flip status to 'grace', send notification
 */
import { createHmac, timingSafeEqual } from 'node:crypto';


import {
  payments,
  subscriptions,
  users,
  type Subscription,
} from '@examready/db/schema';
import { PRICING } from '@examready/shared';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';

export type PaystackEvent =
  | { event: 'charge.success'; data: PaystackChargeData }
  | { event: 'subscription.create'; data: PaystackSubscriptionData }
  | { event: 'subscription.disable'; data: PaystackSubscriptionData }
  | { event: 'subscription.not_renew'; data: PaystackSubscriptionData }
  | { event: 'invoice.payment_failed'; data: PaystackInvoiceData }
  | { event: string; data: unknown };

type PaystackChargeData = {
  reference: string;
  amount: number; // kobo
  customer: { customer_code: string; email?: string };
  metadata?: Record<string, unknown>;
  paid_at?: string;
  status?: string;
};

type PaystackSubscriptionData = {
  subscription_code: string;
  customer: { customer_code: string };
  plan: { plan_code: string; amount: number; interval: string };
  status: string;
  next_payment_date?: string;
  start?: number;
};

type PaystackInvoiceData = {
  customer: { customer_code: string };
  subscription?: { subscription_code: string };
  amount: number;
};

export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    // eslint-disable-next-line no-console
    console.error('[paystack] PAYSTACK_SECRET_KEY not set — refusing to verify webhook');
    return false;
  }
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Defense-in-depth: re-fetch the transaction from Paystack's API before
 * trusting the webhook payload. Catches the rare case where someone forges
 * a payload with a leaked-but-stale-secret signature replay.
 */
export async function verifyTransactionWithApi(reference: string): Promise<{
  ok: boolean;
  amountKobo?: number;
  status?: string;
}> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { ok: false };

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) return { ok: false };
  const data = (await res.json()) as { status?: boolean; data?: { amount?: number; status?: string } };
  if (!data.status || !data.data) return { ok: false };
  return { ok: true, amountKobo: data.data.amount, status: data.data.status };
}

function planFromPlanCode(planCode: string): keyof typeof PRICING | null {
  // Plan codes are configured in Paystack dashboard; we map them here.
  // Sprint 0: assume the plan code matches our enum slug. Real mapping
  // can use env vars (PAYSTACK_PLAN_CODE_BASIC etc.) once plans exist.
  if (planCode in PRICING) return planCode as keyof typeof PRICING;
  if (planCode === process.env.PAYSTACK_PLAN_BASIC_MONTHLY) return 'basic_monthly';
  if (planCode === process.env.PAYSTACK_PLAN_PRO_MONTHLY) return 'pro_monthly';
  if (planCode === process.env.PAYSTACK_PLAN_PRO_ANNUAL) return 'pro_annual';
  return null;
}

function tierForPlan(plan: keyof typeof PRICING): 'basic' | 'pro' {
  return plan === 'basic_monthly' ? 'basic' : 'pro';
}

export async function handleChargeSuccess(data: PaystackChargeData): Promise<void> {
  // Idempotent: ON CONFLICT DO NOTHING via paystack_reference UNIQUE.
  const verification = await verifyTransactionWithApi(data.reference);
  if (!verification.ok) {
    // eslint-disable-next-line no-console
    console.error('[paystack] charge.success failed reverification:', data.reference);
    return;
  }
  if (verification.amountKobo !== data.amount) {
    // eslint-disable-next-line no-console
    console.error('[paystack] amount mismatch — refusing to record payment:', data.reference);
    return;
  }

  const userId = await findUserByCustomerCode(data.customer.customer_code);
  if (!userId) {
    // eslint-disable-next-line no-console
    console.warn('[paystack] charge.success — no user for customer_code', data.customer.customer_code);
    return;
  }

  await db
    .insert(payments)
    .values({
      userId,
      paystackReference: data.reference,
      amountKobo: data.amount,
      status: 'success',
      paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
      metadata: { customerCode: data.customer.customer_code, ...data.metadata },
    })
    .onConflictDoNothing();
}

export async function handleSubscriptionCreate(data: PaystackSubscriptionData): Promise<void> {
  const userId = await findUserByCustomerCode(data.customer.customer_code);
  if (!userId) return;
  const plan = planFromPlanCode(data.plan.plan_code);
  if (!plan) return;

  const periodEnd = data.next_payment_date
    ? new Date(data.next_payment_date)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const startedAt = data.start ? new Date(data.start * 1000) : new Date();

  await db.transaction(async (tx) => {
    // Upsert by subscription_code.
    const existing = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.paystackSubscriptionCode, data.subscription_code))
      .limit(1);

    if (existing[0]) {
      await tx
        .update(subscriptions)
        .set({
          status: 'active',
          currentPeriodEndsAt: periodEnd,
          autoRenew: true,
          cancelledAt: null,
        })
        .where(eq(subscriptions.id, existing[0].id));
    } else {
      await tx.insert(subscriptions).values({
        userId,
        paystackSubscriptionCode: data.subscription_code,
        paystackCustomerCode: data.customer.customer_code,
        plan,
        amountKobo: data.plan.amount,
        startedAt,
        currentPeriodEndsAt: periodEnd,
        status: 'active',
        autoRenew: true,
      });
    }

    // Denormalize tier on users for fast tier-gate checks.
    await tx
      .update(users)
      .set({
        subscriptionTier: tierForPlan(plan),
        subscriptionExpiresAt: periodEnd,
      })
      .where(eq(users.id, userId));
  });
}

export async function handleSubscriptionDisable(data: PaystackSubscriptionData): Promise<void> {
  // Mark cancelled but keep tier active until current_period_ends_at —
  // the subscription-check cron handles the actual downgrade then.
  await db
    .update(subscriptions)
    .set({
      status: 'cancelled',
      autoRenew: false,
      cancelledAt: new Date(),
    })
    .where(eq(subscriptions.paystackSubscriptionCode, data.subscription_code));
}

export async function handleInvoicePaymentFailed(data: PaystackInvoiceData): Promise<void> {
  if (!data.subscription?.subscription_code) return;
  // Move into grace state. Subscription-check cron decides expiry.
  await db
    .update(subscriptions)
    .set({ status: 'grace' })
    .where(eq(subscriptions.paystackSubscriptionCode, data.subscription.subscription_code));
}

async function findUserByCustomerCode(customerCode: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.paystackCustomerCode, customerCode))
    .limit(1);
  return row?.userId ?? null;
}

export type SubscriptionRow = Subscription;
