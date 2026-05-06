# Launch Checklist (Sprint 6 — staging.examready.ng)

Pre-launch tasks that need to happen _outside the codebase_ — vendor accounts, DNS, real phones, manual testing — before private beta. Each item is a tick-box, sorted **top-down by leverage**: highest-impact first.

**Status tags:**

- `[CODE-READY]` — implementation complete, just needs human ops execution
- `[BLOCKED-EXTERNAL]` — waiting on vendor approval (Termii sender, Paystack KYC, AdSense)
- `[BLOCKED-DECISION]` — waiting on user decision (founder bio, WhatsApp number)
- `[BLOCKED-CONTENT]` — waiting on content review (questions, blog posts)

> **Sprint 6 changes:** Pidgin feature-flagged off (PIDGIN_ENABLED), DeepSeek replaced Anthropic for all features, OpenAI gpt-4o-mini is the emergency fallback, AI Examiner + Predicted Score added as new moat features, WAEC + NECO promoted to coverage_status='beta', international exams hidden. See SESSION_REPORT.md for the full delta.

---

## ⭐ Top 10 actions — do these first

| #   | Task                                                                                                         | Status             | Time           | Cost            |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------ | -------------- | --------------- |
| 1   | Run `pnpm preflight` against staging env to confirm all required services responding                         | [CODE-READY]       | 5 min          | $0              |
| 2   | Apply migration 0004 (RLS extension) + migrations 0006/0007/0008 to staging DB                               | [CODE-READY]       | 10 min         | $0              |
| 3   | Promote a test user to admin via `app_metadata.role = 'admin'` (NOT user_metadata — see AUDIT_REPORT.md C-1) | [CODE-READY]       | 5 min          | $0              |
| 4   | Run staging end-to-end manual test plan — see [STAGING_BRINGUP.md](STAGING_BRINGUP.md)                       | [CODE-READY]       | 60 min         | $0              |
| 5   | Trigger one bulk-generate batch (15 questions × 5 topics × WAEC Math) to verify QStash worker                | [CODE-READY]       | 15 min         | ~$0.10 DeepSeek |
| 6   | Hire content reviewer (₦100-200k budget, 60 hours of moderation queue work)                                  | [BLOCKED-DECISION] | 1 week to find | ₦100-200k       |
| 7   | Complete Termii sender approval — see [TERMII_FINISH.md](TERMII_FINISH.md)                                   | [BLOCKED-EXTERNAL] | 2-7 days       | $0 (free tier)  |
| 8   | Paystack live KYC + plan setup — see [PAYSTACK_GO_LIVE.md](PAYSTACK_GO_LIVE.md)                              | [BLOCKED-EXTERNAL] | 2-5 days       | $0              |
| 9   | Replace founder bio placeholder in `apps/web/app/(marketing)/about/page.tsx`                                 | [BLOCKED-DECISION] | 30 min         | $0              |
| 10  | Replace WhatsApp Business number `+2348012345678` in contact page                                            | [BLOCKED-DECISION] | 5 min          | $0              |

---

## 1. Production environments

### Supabase (auth + Postgres)

- [ ] Create production Supabase project (region: closest to Lagos — Frankfurt or US-East). [BLOCKED-EXTERNAL — needs vendor signup, ~10 min]
- [ ] Run all migrations against the production database (`pnpm db:migrate`) [CODE-READY]
- [ ] Apply `packages/db/migrations/extras/0004_rls_extend_sprint6.sql` separately (extras don't auto-run) [CODE-READY]
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Vercel for both `web` and `admin` projects
- [ ] Configure Auth → Providers: enable Phone (Termii custom SMS — see §2)
- [ ] **Promote admin via app_metadata** (Sprint 6 audit fix C-1): `supabase.auth.admin.updateUserById(id, { app_metadata: { role: 'admin' } })`. **Do NOT use user_metadata** — that's client-mutable.
- [ ] Set up Supabase Standard Webhooks → `/api/webhooks/supabase/send-sms` with the signing secret, then put `SUPABASE_AUTH_HOOK_SECRET` in Vercel

### Vercel (web + admin apps)

- [ ] Connect both apps to the GitHub repo, deploy to staging from `main` and production from `main` (or a `production` branch)
- [ ] Set domain: `staging.examready.ng` → web (current sprint goal); `examready.ng` and `admin.examready.ng` later
- [ ] Confirm build command: `pnpm --filter @examready/web build` and `pnpm --filter @examready/admin build`
- [ ] Confirm Node 20 runtime
- [ ] Set `CRON_SECRET` (random 32-char) and wire it into Vercel cron schedules per `vercel.json`
- [ ] Run `pnpm --filter @examready/web preflight` against the staging env vars to validate everything responds

### Upstash Redis + QStash

- [ ] Create Upstash Redis database (region matching Vercel)
- [ ] Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- [ ] Create Upstash QStash account (Sprint 6 — for bulk-generate fan-out)
- [ ] Set `UPSTASH_QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
- [ ] Verify rate-limiting works against prod Redis with a single curl test before announcing

### DNS & email

- [ ] Point `staging.examready.ng` and `examready.ng` at Vercel
- [ ] Verify TLS certs auto-provisioned
- [ ] Add SPF / DKIM / DMARC records for `mail.examready.ng` (Resend dashboard provides exact strings)
- [ ] Test deliverability to one Gmail and one Yahoo address before opening signups

### Sentry + PostHog

- [ ] Create Sentry project for `web` and a separate one for `admin`
- [ ] Set `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in Vercel
- [ ] Verify a synthetic 500 surfaces in Sentry within 60 seconds
- [ ] Create PostHog project, set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in `web` only
- [ ] Verify a pageview event lands in PostHog from a real browser visit

### DeepSeek (primary AI provider)

- [ ] Sign up at https://platform.deepseek.com, fund $20 to clear new-account hold
- [ ] Generate API key at https://platform.deepseek.com/api_keys
- [ ] Set `DEEPSEEK_API_KEY` in Vercel for `web` only (production AND staging)
- [ ] Set a billing alert at half projected daily spend (see [API_COSTS.md](API_COSTS.md))
- [ ] Hit `GET /api/health/ai` once both keys are wired; deepseek should return ok=true within 5s

### OpenAI (emergency fallback)

- [ ] Sign up at https://platform.openai.com, add billing
- [ ] Generate `OPENAI_API_KEY` (gpt-4o-mini is in the default allowlist)
- [ ] Set `OPENAI_API_KEY` in Vercel
- [ ] Verify `/api/health/ai` shows openai ok=true

---

## 2. Vendors with phone / payment / SMS

See dedicated guides:

- **Termii** — [TERMII_FINISH.md](TERMII_FINISH.md). Sender approval can take 2-7 days; start early.
- **Paystack** — [PAYSTACK_GO_LIVE.md](PAYSTACK_GO_LIVE.md). KYC takes 2-5 days; start early.

### Resend (transactional email)

- [ ] Resend production account, domain verified for `mail.examready.ng`
- [ ] `RESEND_API_KEY` in Vercel
- [ ] Send one test welcome email + one test reset-password email, confirm both land

### AdSense (free-tier ads — DEFERRED, not launch-blocking)

- [ ] Apply to AdSense; expect 1–2 weeks review
- [ ] Once approved, create one ad unit per placement (`results_top`, `dashboard_lower`, etc.)
- [ ] Populate `NEXT_PUBLIC_ADSENSE_SLOT_*` env vars per placement
- [ ] Verify the kill switch at `/admin/ads-toggle` works

---

## 3. End-to-end verification on staging

See [STAGING_BRINGUP.md](STAGING_BRINGUP.md) for the step-by-step plan. Highlights:

- Signup → OTP → onboarding with a real Nigerian SIM (target OTP < 60s)
- 10-question practice attempt, results page renders ExplanationCard + thumbs UI
- Trigger every "Explain differently" level — Pidgin should return `404 FEATURE_DISABLED` until reviewer signs off
- AI tutor streaming feels responsive on 3G (incremental chunks)
- AI Examiner: submit a theory answer on a WAEC question with a populated marking guide
- Predicted Score: returns INSUFFICIENT_DATA for new users (< 50 questions)
- Daily reminder cron — confirm SMS lands on test SIM
- Paystack subscription upgrade flow

---

## 4. Pidgin re-enablement (deferred, post-launch)

PIDGIN_ENABLED is `false` by default. To re-enable for production:

1. Run the 15-test verification suite from [PIDGIN_SAMPLES.md](PIDGIN_SAMPLES.md) against DeepSeek with PIDGIN_ENABLED=true on staging
2. Pass criterion: average ≥ 4/5 across the suite, no single sample ≤ 2 on any axis
3. If pass: set `PIDGIN_ENABLED=true` AND `NEXT_PUBLIC_PIDGIN_ENABLED=true` in production env
4. If fail: tighten the prompt in `apps/web/lib/ai/prompts/explain-differently.ts` and re-run

---

## 5. Security & content gates

These don't ship features but block launch.

- [ ] **Apply migration 0004_rls_extend_sprint6.sql** — see AUDIT_REPORT.md M-1 [CODE-READY]
- [ ] **Promote admin via app_metadata** (not user_metadata) — see AUDIT_REPORT.md C-1 [CODE-READY]
- [ ] **Next.js 14 → 15 migration** — H-2 in AUDIT_REPORT.md. **Hard gate before any open-signup launch.** Mitigated for private beta by Cloudflare + per-route rate limits. Schedule a focused 2–3 day sprint.
- [ ] **Termii webhook signature** — see TERMII_FINISH.md
- [ ] **Lighthouse mobile run** — ≥ 90 perf, ≥ 95 accessibility on `/`, `/practice`, `/results`. Real device, not Lighthouse-CI.
- [ ] **Real Android 3G test** — practice runner usable on a 1GB RAM Android over throttled 3G

---

## 6. Content readiness

- [ ] Hire content reviewer (₦100-200k budget, ~60 hours over 2-3 weeks)
- [ ] Run JAMB bulk-generate batch: 25 questions × 9 subjects × all topics ≈ 2,250 questions. ~$2.50 DeepSeek cost.
- [ ] Run WAEC bulk-generate: ~720 questions. ~$0.75.
- [ ] Run NECO bulk-generate: ~720 questions. ~$0.75.
- [ ] Reviewer works through `/admin/questions/ai-queue` with J/K/A/R/E shortcuts (target: 60/hour)
- [ ] Promote WAEC SSCE + NECO SSCE coverage_status from `beta` → `live` once each crosses 1500+ approved questions (admin SQL update)
- [ ] No question with `is_active = true` was approved without a human click — query: `SELECT COUNT(*) FROM questions WHERE generated_by_model IS NOT NULL AND is_active = true AND approved_by IS NULL` returns 0
- [ ] Founder bio in `/about` replaced with the real story
- [ ] Bursaries page has at least 5 real, current opportunities

---

## 7. Day-of launch

- [ ] One person on call for the first 24h to watch Sentry + the AI cost dashboard
- [ ] DeepSeek billing alert set to half daily spend so a runaway loop pages someone
- [ ] PostHog funnel for signup → first-attempt → second-session set up in advance
- [ ] Have the kill switches ready: `/admin/ads-toggle`, `AI_FEATURES_ENABLED` env override, Cloudflare rate-limit ramp
- [ ] Do not announce to mass channels until ≥ 24h of beta traffic has flowed without a Sentry P0
