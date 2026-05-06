# Launch Checklist

Pre-launch tasks that need to happen _outside the codebase_ — vendor accounts, DNS, real phones, billing, manual testing — before private beta. Each item is a tick-box; nothing here is automatable from a coding session.

> Order: do (1) and (2) first. (3) and (4) can run in parallel. (5) is the gate to any external-facing announcement.

---

## 1. Production environments

### Supabase (auth + Postgres)

- [ ] Create production Supabase project (region: closest to Lagos — Frankfurt or US-East)
- [ ] Run all 6 migrations against the production database (`pnpm db:migrate`)
- [ ] Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Vercel for both `web` and `admin` projects
- [ ] Configure Auth → Providers: enable Phone (Termii custom SMS — see §2), disable email signup if students should be SMS-only
- [ ] Create an admin user record manually in Supabase Auth, then promote via SQL: `UPDATE user_profiles SET role = 'admin' WHERE id = '<auth-uid>';`
- [ ] Set up Supabase Standard Webhooks → `/api/webhooks/supabase` with the signing secret from the Supabase dashboard, then put `SUPABASE_WEBHOOK_SECRET` in Vercel

### Vercel (web + admin apps)

- [ ] Connect both apps to the GitHub repo, deploy to production from `main`
- [ ] Set domain: `examready.ng` → web, `admin.examready.ng` → admin
- [ ] Enable preview deployments for PR review
- [ ] Confirm build command: `pnpm --filter @examready/web build` and `pnpm --filter @examready/admin build`
- [ ] Confirm Node 20 runtime for both
- [ ] Set `CRON_SECRET` (random 32-char) and wire it into Vercel cron schedules per `vercel.json`

### Upstash Redis (rate limit + AI quota throughput)

- [ ] Create Upstash database (region matching Vercel)
- [ ] Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` on both apps
- [ ] Verify rate-limiting works against prod Redis with a single curl test before announcing

### DNS & email

- [ ] Point `examready.ng` and `admin.examready.ng` at Vercel
- [ ] Verify TLS certs auto-provisioned
- [ ] Add SPF / DKIM / DMARC records for `mail.examready.ng` (Resend dashboard provides exact strings)
- [ ] Test deliverability to one Gmail and one Yahoo address before opening signups

### Sentry + PostHog

- [ ] Create Sentry project for `web` and a separate one for `admin`
- [ ] Set `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in Vercel
- [ ] Verify a synthetic 500 surfaces in Sentry within 60 seconds
- [ ] Create PostHog project, set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in `web` only (not admin)
- [ ] Verify a pageview event lands in PostHog from a real browser visit

### Anthropic (AI features — tutor + Pidgin moat)

- [ ] Production API key with billing limit set on the Anthropic console
- [ ] Set `ANTHROPIC_API_KEY` in Vercel for `web` only (production AND staging)
- [ ] Decide initial billing alert threshold (recommend $50/day for first month — see [API_COSTS.md](API_COSTS.md))
- [ ] Confirm Sonnet 4.6 + Haiku 4.5 are in the org's allowlist (some new orgs default to allowing only earlier models)

### DeepSeek (AI features — high-volume non-Pidgin)

Sprint 5 introduced a hybrid provider strategy. See [lib/ai/README.md](apps/web/lib/ai/README.md) for the per-feature routing table.

- [ ] Sign up at https://platform.deepseek.com, fund the account with at least $20 to clear the new-account hold
- [ ] Generate API key at https://platform.deepseek.com/api_keys
- [ ] Set `DEEPSEEK_API_KEY` in Vercel for `web` only (production AND staging)
- [ ] Set a billing alert at half your projected DeepSeek spend (see [API_COSTS.md](API_COSTS.md) — projection is ~10% of the all-Claude cost)
- [ ] Hit `GET /api/health/ai` from the admin app once both keys are wired; both providers should return `ok: true` within 5s
- [ ] If DeepSeek goes 5xx, traffic auto-falls back to Claude Haiku 4.5 (per route — Pidgin is the lone exception, never falls back)

---

## 2. Vendors with phone / payment / SMS

### Termii (SMS + WhatsApp)

- [ ] Create Termii Business account, fund wallet
- [ ] Verify sender ID `EXAMREADY` (Nigerian DLT registration takes ~3 business days)
- [ ] Get production `TERMII_API_KEY`, set in Vercel
- [ ] **Webhook signature verification** — `apps/web/app/api/webhooks/termii/route.ts` is currently a Sprint 0 stub with no signature check. Before launch: implement the HMAC verification per Termii docs, get the webhook secret, set `TERMII_WEBHOOK_SECRET`. Carrier delivery receipts are otherwise unverifiable.
- [ ] Update WhatsApp Business number on `apps/web/app/(marketing)/contact/page.tsx` (currently `+2348012345678` placeholder)
- [ ] Test OTP flow with a real Nigerian SIM end-to-end (MTN + Airtel + Glo if you can — networks have different latencies)

### Paystack (subscriptions + bursary payouts)

- [ ] Create Paystack Live account, complete KYC
- [ ] Get production `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY`, set in Vercel
- [ ] Create plan codes for Basic and Pro tiers in Paystack dashboard, populate `PAYSTACK_PLAN_BASIC` / `PAYSTACK_PLAN_PRO` env vars
- [ ] Configure webhook URL → `https://examready.ng/api/webhooks/paystack`, copy the live webhook secret to `PAYSTACK_WEBHOOK_SECRET`
- [ ] Make one real test transaction in live mode with a live Verve/Visa card, confirm the webhook fires and the user's `subscriptionTier` updates
- [ ] Confirm refund flow works (cancel test sub, see status downgrade after grace period)

### Resend (transactional email)

- [ ] Resend production account, domain verified for `mail.examready.ng`
- [ ] `RESEND_API_KEY` in Vercel
- [ ] Send one test welcome email + one test reset-password email, confirm both land

### AdSense (free-tier ads)

- [ ] Apply to AdSense; expect 1–2 weeks review
- [ ] Once approved, create one ad unit per placement (`results_top`, `dashboard_lower`, etc.)
- [ ] Populate `NEXT_PUBLIC_ADSENSE_SLOT_*` env vars per placement
- [ ] Verify the kill switch at `/admin/ads-toggle` actually hides ads when toggled

---

## 3. End-to-end verification (real devices, real accounts)

Run on a real Android phone over Nigerian 3G/4G. Emulator latency does not represent reality. Each box is one full flow, top-to-bottom, no skipped steps.

- [ ] **Signup → OTP → onboarding** with a real Nigerian SIM. Time the OTP delivery — should arrive < 60s. If it doesn't, fix Termii config before any other work.
- [ ] **Take a 10-question practice attempt.** Verify question rendering, timer, scoring, and that the results page shows the explain-differently dropdown and thumbs feedback.
- [ ] **Trigger every "Explain differently" level** (simpler / with-analogy / in-pidgin) on at least 3 questions. Note Pidgin samples in [PIDGIN_SAMPLES.md](PIDGIN_SAMPLES.md) for review.
- [ ] **Open AI tutor**, send 3 messages, confirm streaming feels responsive on 3G (chunks arriving incrementally, not in one delayed burst).
- [ ] **Daily reminder cron** — wait one cycle (or hit the cron URL with `Authorization: Bearer $CRON_SECRET`), confirm a reminder SMS lands on the test SIM for a stale-streak account.
- [ ] **Paystack subscription** — upgrade a test user to Basic, see `subscriptionTier` flip, confirm AI quota caps lift in the same session (refresh).
- [ ] **Admin actions** — log in to `/admin`, approve one AI-generated question via `J A` keyboard shortcut, confirm it appears in the live question pool.
- [ ] **AI quality review** — toggle `AI_LOG_SAMPLES=true`, run 10 explain calls across all three levels, see them land on `/admin/ai-quality-review`, then turn the env var off again.

---

## 4. Pidgin quality verification

Before announcing the Pidgin moat publicly, run a hand-curated 15-test suite to verify register stays authentic.

- [ ] Pick 5 distinct math, 5 English-comprehension, 5 physics questions — diverse topic + register coverage
- [ ] For each, hit `/api/ai/explain-differently` with `level: 'in-pidgin'` and capture the output verbatim into [PIDGIN_SAMPLES.md](PIDGIN_SAMPLES.md)
- [ ] For each sample, mark a hand-rated score (1–5) on: authenticity, clarity, technical-term preservation, and absence of Jamaican Patois / Yoruba/Igbo/Hausa words
- [ ] Average score must be ≥ 4/5 across the suite. If anything scores ≤ 2, tighten the prompt in `apps/web/lib/ai/prompts/explain-differently.ts` and re-run
- [ ] Document the results — go-no-go signal for the marketing claim

---

## 5. Security & content gates

These don't ship features but block launch.

- [ ] **Next.js 14.2 → 15 migration** — deferred from this Sprint 4 session. Two open advisories (DoS × 2). Assessed acceptable for closed private beta because:
  - Cloudflare in front of Vercel rate-limits the attack vectors
  - Our own per-route rate limiting holds
  - User base is bounded and known during beta
  - Migration involves async `cookies()` / `headers()` / `params`, React 19, and caching changes — needs a focused dedicated session, not a launch rush
  - **Must be done before any open-signup launch.**
- [ ] **Termii webhook signature** (see §2) — must be implemented before launch
- [ ] **Lighthouse mobile run** — ≥ 90 perf, ≥ 95 accessibility on `/`, `/practice`, `/results`. Real device, not Lighthouse-CI.
- [ ] **Manual security pass** — confirm no admin route is missing the `auth: 'admin'` gate, no API route is missing rate limit, no `dangerouslySet*` was added without escaping. (Codebase is currently clean per Sprint 4 audit.)
- [ ] **Real Android 3G test** — practice runner usable on a 1GB RAM Android over throttled 3G. If first-paint > 4s on /practice, add the missing optimization before launch.

---

## 6. Content readiness

- [ ] At least 50 **human-reviewed** questions per active subject (550+ total). AI-drafted, human-approved counts.
- [ ] No question with `is_active = true` was approved without a human click — query: `SELECT COUNT(*) FROM questions WHERE generated_by_model IS NOT NULL AND is_active = true AND moderated_by IS NULL` should return `0`. (If this query returns > 0, the moderation flow has a bug.)
- [ ] Founder bio in `/about` replaced with the real story (Sprint 1 left a placeholder marked `PLACEHOLDER` in the source comment)
- [ ] Bursaries page has at least 5 real, current opportunities (not the demo seed)

---

## 7. Day-of launch

- [ ] One person on call for the first 24h to watch Sentry + the AI cost dashboard
- [ ] Anthropic billing alert set to half of your projected daily spend so a runaway loop pages someone
- [ ] PostHog funnel for signup → first-attempt → second-session set up in advance — you want to read it on day 2, not figure out how to build it on day 2
- [ ] Have the kill switches ready: `/admin/ads-toggle` (ads), `AI_FEATURES_ENABLED` env var (kills all `/api/ai/*` if it goes wrong), Cloudflare rate-limit ramp
- [ ] Do not announce to mass channels until ≥ 24h of beta traffic has flowed without a Sentry P0
