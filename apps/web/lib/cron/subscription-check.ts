/**
 * Subscription expiry cron — fires hourly.
 *
 * Finds subscriptions whose current_period_ends_at has passed and
 * transitions their state:
 *   active   + expired    → grace      (3-day grace period starts)
 *   grace    + expired    → expired    (downgrade user to free)
 *   trial    + expired    → expired    (trial over, downgrade)
 *
 * On final downgrade, sets users.subscription_tier='free' and clears
 * subscription_expires_at, then sends the subscription_expired notification.
 */

import { subscriptions, users } from '@examready/db/schema';
import { send } from '@examready/notifications';
import { SUBSCRIPTION_GRACE_DAYS } from '@examready/shared';
import { and, eq, inArray, lt, or } from 'drizzle-orm';

import type { Db } from '../db';

export type SubscriptionCheckResult = {
  subscriptionsScanned: number;
  movedToGrace: number;
  expired: number;
  notificationsSent: number;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function runSubscriptionCheck(
  db: Db,
  nowUtc: Date,
): Promise<SubscriptionCheckResult> {
  const result: SubscriptionCheckResult = {
    subscriptionsScanned: 0,
    movedToGrace: 0,
    expired: 0,
    notificationsSent: 0,
  };

  // Pull subscriptions that are past their period end and still in a
  // chargeable state (active / trial / grace).
  const expiringSubs = await db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      status: subscriptions.status,
      plan: subscriptions.plan,
      currentPeriodEndsAt: subscriptions.currentPeriodEndsAt,
      cancelledAt: subscriptions.cancelledAt,
    })
    .from(subscriptions)
    .where(
      and(
        lt(subscriptions.currentPeriodEndsAt, nowUtc),
        inArray(subscriptions.status, ['active', 'trial', 'grace']),
      ),
    );

  result.subscriptionsScanned = expiringSubs.length;

  for (const sub of expiringSubs) {
    const userOptIns = await db
      .select({
        phone: users.phone,
        email: users.email,
        whatsappOptedIn: users.whatsappOptedIn,
        emailOptedIn: users.emailOptedIn,
      })
      .from(users)
      .where(eq(users.id, sub.userId))
      .limit(1);
    const userInfo = userOptIns[0];

    if (sub.status === 'active' || sub.status === 'trial') {
      // First time past period end — move into grace if Paystack hasn't
      // already cancelled it. The webhook handler also sets `grace` when a
      // payment fails; this cron handles the case where the renewal never
      // attempted (network failure, Paystack outage).
      const graceEnd = new Date(sub.currentPeriodEndsAt.getTime() + SUBSCRIPTION_GRACE_DAYS * ONE_DAY_MS);

      if (nowUtc < graceEnd) {
        await db
          .update(subscriptions)
          .set({ status: 'grace' })
          .where(eq(subscriptions.id, sub.id));
        result.movedToGrace += 1;
      } else {
        // Already past the grace window — go straight to expired.
        await expireSubscription(db, sub.id, sub.userId);
        result.expired += 1;
        if (userInfo) {
          await sendExpiryNotification(userInfo, sub.plan);
          result.notificationsSent += 1;
        }
      }
    } else if (sub.status === 'grace') {
      const graceEnd = new Date(sub.currentPeriodEndsAt.getTime() + SUBSCRIPTION_GRACE_DAYS * ONE_DAY_MS);
      if (nowUtc >= graceEnd) {
        await expireSubscription(db, sub.id, sub.userId);
        result.expired += 1;
        if (userInfo) {
          await sendExpiryNotification(userInfo, sub.plan);
          result.notificationsSent += 1;
        }
      }
    }
  }

  return result;
}

async function expireSubscription(db: Db, subId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ status: 'expired' })
      .where(eq(subscriptions.id, subId));

    // Downgrade user only if they don't have ANOTHER active subscription
    // (rare but possible — someone re-subscribed before the old one expired).
    const stillActive = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          or(
            eq(subscriptions.status, 'active'),
            eq(subscriptions.status, 'trial'),
            eq(subscriptions.status, 'grace'),
          ),
        ),
      )
      .limit(1);

    if (stillActive.length === 0) {
      await tx
        .update(users)
        .set({ subscriptionTier: 'free', subscriptionExpiresAt: null })
        .where(eq(users.id, userId));
    }
  });
}

async function sendExpiryNotification(
  user: { phone: string; email: string | null; whatsappOptedIn: boolean; emailOptedIn: boolean },
  plan: 'basic_monthly' | 'pro_monthly' | 'pro_annual',
): Promise<void> {
  const channel: 'whatsapp' | 'email' | null = user.whatsappOptedIn
    ? 'whatsapp'
    : user.emailOptedIn
      ? 'email'
      : null;
  if (!channel) return;

  const planLabel = plan === 'basic_monthly' ? 'Basic' : plan === 'pro_monthly' ? 'Pro' : 'Pro Annual';
  await send({
    templateKey: 'subscription_expired',
    to: { phone: user.phone, email: user.email ?? undefined },
    channel,
    vars: {
      '1': planLabel,
      '2': process.env.PUBLIC_BASE_URL ?? 'https://examready.ng',
    },
  });
}
