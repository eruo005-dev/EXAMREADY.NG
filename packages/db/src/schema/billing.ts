import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  paymentStatusEnum,
  subscriptionPlanEnum,
  subscriptionStatusEnum,
} from './enums';

/**
 * subscriptions — Paystack-managed recurring plans.
 *
 * amount_kobo stores the value in kobo (NGN × 100) as integer to avoid
 * floating-point arithmetic on money. The Paystack webhook is the
 * authoritative source for status transitions; the cron job at
 * /api/cron/subscription-check handles grace → expired downgrades.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    paystackSubscriptionCode: varchar('paystack_subscription_code', { length: 100 }),
    paystackCustomerCode: varchar('paystack_customer_code', { length: 100 }),
    plan: subscriptionPlanEnum('plan').notNull(),
    amountKobo: integer('amount_kobo').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true }).notNull(),
    status: subscriptionStatusEnum('status').notNull(),
    autoRenew: boolean('auto_renew').notNull().default(true),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    paystackCodeUnique: uniqueIndex('subscriptions_paystack_code_unique')
      .on(t.paystackSubscriptionCode)
      .where(sql`${t.paystackSubscriptionCode} IS NOT NULL`),
    userStatusIdx: index('subscriptions_user_status_idx').on(t.userId, t.status),
    customerCodeIdx: index('subscriptions_customer_code_idx').on(t.paystackCustomerCode),
    expiringIdx: index('subscriptions_expiring_idx')
      .on(t.currentPeriodEndsAt)
      .where(sql`${t.status} IN ('active', 'trial', 'grace')`),
  }),
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    subscriptionId: uuid('subscription_id'),
    /**
     * paystack_reference is the idempotency key for the webhook handler.
     * Receiving the same reference twice must not double-record the payment.
     */
    paystackReference: varchar('paystack_reference', { length: 100 }).notNull(),
    amountKobo: integer('amount_kobo').notNull(),
    status: paymentStatusEnum('status').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    referenceUnique: uniqueIndex('payments_reference_unique').on(t.paystackReference),
    userPaidIdx: index('payments_user_paid_idx').on(t.userId, t.paidAt.desc()),
    statusIdx: index('payments_status_idx').on(t.status, t.createdAt),
  }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
