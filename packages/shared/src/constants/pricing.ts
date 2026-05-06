/**
 * Pricing — NGN only, stored in kobo (NGN x 100) to avoid float math.
 *
 * Single source of truth for the pricing page, Paystack initialization,
 * and webhook reconciliation. If these numbers ever drift between the
 * database and code, the webhook handler refuses to mutate state.
 */
export const PRICING = {
  basic_monthly: {
    plan: 'basic_monthly' as const,
    label: 'Basic',
    cadence: 'month' as const,
    amountKobo: 250_000, // ₦2,500
    amountNgn: 2_500,
    description: 'No ads, 20 AI questions/day, unlimited mock CBT.',
  },
  pro_monthly: {
    plan: 'pro_monthly' as const,
    label: 'Pro',
    cadence: 'month' as const,
    amountKobo: 500_000, // ₦5,000
    amountNgn: 5_000,
    description: 'Everything in Basic + offline downloads + priority WhatsApp support.',
  },
  pro_annual: {
    plan: 'pro_annual' as const,
    label: 'Pro Annual',
    cadence: 'year' as const,
    amountKobo: 2_500_000, // ₦25,000
    amountNgn: 25_000,
    description: 'Pro plan billed yearly — save ~58% vs paying monthly.',
  },
} as const;

export type PaidPlan = keyof typeof PRICING;

export const TRIAL_DAYS = 7;
export const SUBSCRIPTION_GRACE_DAYS = 3;

/** Format kobo as a Naira string with the ₦ symbol and thousands separators. */
export const formatKoboAsNaira = (kobo: number): string => {
  const naira = Math.round(kobo / 100);
  return `₦${naira.toLocaleString('en-NG')}`;
};
