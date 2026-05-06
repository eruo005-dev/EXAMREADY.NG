# Paystack — Live Mode Go-Live Guide

What you need to flip Paystack from test mode to live mode and start collecting real money.

---

## KYC requirements

Paystack will reject the live-mode application until ALL of these are uploaded and verified. Have them ready BEFORE clicking "Activate live keys":

- [ ] **CAC certificate** (Corporate Affairs Commission registration)
- [ ] **BVN** of the primary account holder (the named director on the CAC)
- [ ] **Bank account verification** — Paystack will deposit a small test amount and ask you to confirm; this proves you control the destination bank account
- [ ] **Business documents:**
  - Memorandum and Articles of Association (M&A) — usually attached to your CAC pack
  - Board resolution authorising you to operate the Paystack account (company letterhead, signed by 2 directors)
- [ ] **Director's ID** — passport, NIN slip, or driver's licence
- [ ] **Utility bill** for the business address (≤ 3 months old)
- [ ] **Website verification** — Paystack will check examready.ng exists, has clear pricing, terms of service, refund policy. **Make sure /pricing, /terms, /privacy pages are deployed and reachable** before submitting KYC.

---

## Test mode → live mode steps

1. **Verify all test-mode flows still work in your codebase.** Test-mode keys validate webhooks the same way live keys do — if it works in test, it'll work live.
2. **Submit KYC** in the Paystack dashboard. Approval typically takes 2-5 business days.
3. **Once approved, generate live keys:**
   - `PAYSTACK_SECRET_KEY` (sk*live*...)
   - `PAYSTACK_PUBLIC_KEY` (pk*live*...)
4. **Add live keys to Vercel:**
   ```
   PAYSTACK_SECRET_KEY=sk_live_xxx           # production env only
   NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_xxx # both environments
   ```
   Keep test keys on staging (`sk_test_...`) so test transactions on staging don't hit live customer cards.
5. **Configure live webhook URL** in Paystack dashboard → Settings → API Keys & Webhooks:
   - Production: `https://examready.ng/api/webhooks/paystack`
   - Staging: `https://staging.examready.ng/api/webhooks/paystack` (for live-mode testing if you want it)
6. **Copy the live webhook secret** to `PAYSTACK_WEBHOOK_SECRET`. **This is different from the API keys** — it's the secret used to sign x-paystack-signature headers, used by `apps/web/lib/webhooks/paystack.ts` for HMAC verification.
7. **Test one real transaction** — use your own card to subscribe to Basic, confirm:
   - Webhook fires within 60s
   - User's `subscriptionTier` updates to 'basic'
   - Receipt email lands

---

## Plan setup

Create three plans in the Paystack dashboard. The exact codes go into your env vars.

### Basic Monthly

- Name: `ExamReady Basic Monthly`
- Amount: ₦2,500
- Interval: monthly
- Currency: NGN
- Description: "Ad-free practice + 50 AI tutor questions/day + 5 study plans/day"
- After creating, copy the plan code (starts with `PLN_...`):
  ```
  PAYSTACK_PLAN_BASIC=PLN_xxxxxxxxxxxxxxxx
  ```

### Pro Monthly

- Name: `ExamReady Pro Monthly`
- Amount: ₦5,000
- Interval: monthly
- Currency: NGN
- Description: "Everything in Basic + unlimited AI + AI Examiner + Predicted Score"
- Copy code:
  ```
  PAYSTACK_PLAN_PRO=PLN_xxxxxxxxxxxxxxxx
  ```

### Pro Annual

- Name: `ExamReady Pro Annual`
- Amount: ₦25,000 (5x monthly — 7 months free vs paying monthly)
- Interval: yearly
- Currency: NGN
- Description: "Save ₦35,000 vs monthly. Best for students with > 6 months until exam."
- Copy code:
  ```
  PAYSTACK_PLAN_PRO_ANNUAL=PLN_xxxxxxxxxxxxxxxx
  ```

---

## Refund flow verification

Before launch, run the refund flow once end-to-end:

1. Subscribe a test user to Basic Monthly with a real card
2. Wait for `charge.success` webhook to fire (verify in Paystack dashboard → Logs)
3. Refund via Paystack dashboard → Transactions → click the transaction → Refund
4. Confirm `subscription.disable` webhook fires within ~5 minutes
5. Confirm the user's `subscriptionTier` returns to 'free' in your DB
6. Confirm AI quotas drop back to free-tier limits (test by hitting `/api/ai/explain-differently` 11 times — the 11th should 403 with TIER_LIMIT_EXCEEDED)

---

## Common pitfalls

- **`charge.success` for non-subscription one-off payments** — these fire even though they're not subscription events. Our webhook ignores them; if you see "received but not handled" in the logs, that's normal.
- **Webhook signature mismatch on staging** — staging uses live webhook secret? Or test? Match keys + secrets to the same mode. Having `sk_live_*` keys but a `whsec_test_*` webhook secret is a common cause of "Invalid signature" 401s.
- **Plan code typos** — Paystack plan codes are easy to typo (PLN vs PIN). Run `pnpm --filter @examready/web preflight` after setting them; it'll catch invalid Paystack auth but not invalid plan codes — verify by hitting `/api/billing/checkout` from the staging app and confirming a redirect URL is generated.
- **BVN mismatch** — if the BVN-attached name doesn't match the CAC director name exactly, KYC stalls. Use the EXACT name as it appears on your BVN slip when submitting.

---

## Pricing-page coherence

Make sure your /pricing page (and Pro upgrade buttons) hit the right plan codes:

- `apps/web/app/(marketing)/pricing/page.tsx` references the plans by env var, not hardcoded
- The "Subscribe" buttons should disable cleanly if the plan code is unset (avoid 500 errors on first deploy when only one of the three plans has a code)

After Paystack is live and plan codes are set, verify each subscribe button initiates a Paystack popup with the right amount.
