# ExamReady.ng

> Nigeria's most trusted online exam prep platform. AI-powered adaptive learning for JAMB, WAEC, NECO, GCE, Post-UTME, NABTEB, and professional exams (ICAN, JUPEB, IELTS, SAT).

Built mobile-first for Nigerian networks. Naira-only pricing. WhatsApp-first communication.

> **Sprint 7 status (2026-05-08):** Editorial factory + JAMB-fidelity CBT engine + web ingestion infrastructure shipped. Content lights up when source files land.
>
> - **Editorial factory:** materials/ → DeepSeek-driven extract → classify → parse → enrich → self-audit → DB. Six pipelines (questions / syllabus / universities / course-combinations / cutoffs / reference). Self-audit with adversarial system prompt + 85/70 thresholds targets ~$0.0010 per question fully processed. CLI: `pnpm editorial-factory`. See [EDITORIAL_FACTORY_README.md](EDITORIAL_FACTORY_README.md).
> - **CBT engine:** JAMB-fidelity full-screen runner at `/cbt/[attemptId]`. 9-key keyboard nav (A/B/C/D/P/N/S/R/K), JAMB-style draggable calculator, color-coded question palette, server-authoritative timer. Cheat sheet at `/cbt/keyboard-help`.
> - **Web ingestion:** scraping cache + robots.txt + rate limit + SSRF allow-list. Wikipedia universities wired; JAMB/WAEC/NECO/NUC/Myschool scaffolded. CLI: `pnpm web-ingest`.
> - **Topic lessons:** schema + public route at `/lessons/[exam]/[subject]/[topic]` with Schema.org JSON-LD.
> - **DeepSeek cost optimisation:** Redis cache for `/api/ai/explain-differently` (TTL 7 days; ~$0 on cache HIT).
> - **What's deferred:** per-pipeline parser prompts (filled on first real source data), vision pipeline, mobile-CBT polish, admin queue UI. See [SESSION_REPORT.md](SESSION_REPORT.md).
>
> **Sprint 6 (2026-05-06) — still applies:**
>
> - **AI provider:** DeepSeek-V3 / R1 primary, OpenAI gpt-4o-mini fallback. See [`apps/web/lib/ai/README.md`](apps/web/lib/ai/README.md).
> - **Moat features:** AI Examiner (theory grading) + Predicted Score (data + AI hybrid).
> - **Pidgin:** feature-flagged off via `PIDGIN_ENABLED` pending Nigerian-fluent reviewer sign-off.
> - **Audit:** AUDIT_REPORT.md — 1 Critical + 1 High + 1 Medium fixed; 1 High deferred (Next 14 → 15).
> - **Blog:** 10 SEO-targeted articles at `/blog`, sitemap-indexed.

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Repository layout](#repository-layout)
3. [Local development setup](#local-development-setup) — clone-to-running in 30 minutes
4. [Environment variables](#environment-variables)
5. [Database](#database) — schema, migrations, seed
6. [Deployment](#deployment) — Vercel, Supabase, Upstash
7. [Third-party integrations](#third-party-integrations) — Termii, Paystack, AdSense, Resend
8. [Operations runbook](#operations-runbook)
9. [Architecture decisions](#architecture-decisions)
10. [Security & privacy](#security--privacy)
11. [Sprint 0 status](#sprint-0-status)

---

## Tech stack

Locked decisions — do not deviate without team discussion.

| Layer              | Choice                                                                    | Why                                                                                                   |
| ------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Monorepo           | pnpm workspaces + Turborepo                                               | Fast, deterministic, well-supported on Vercel                                                         |
| Frontend           | Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui                 | Single framework for SSR + API routes                                                                 |
| Backend            | Next.js Route Handlers as Vercel Serverless                               | One deploy target, fewer cold starts than separate API                                                |
| State              | Zustand (client) + TanStack Query (server)                                | Minimal boilerplate, great DX                                                                         |
| Database           | Supabase Postgres + Realtime + Storage                                    | Managed Postgres + auth + realtime in one                                                             |
| ORM                | Drizzle                                                                   | TypeScript-native, fast, no codegen step                                                              |
| Auth               | Supabase Auth (phone OTP via Termii hook, email, Google)                  | Phone-first (Nigeria) with full identity flow                                                         |
| Cache + rate-limit | Upstash Redis                                                             | Serverless-friendly, Vercel-native                                                                    |
| Background jobs    | Upstash QStash                                                            | Replaces BullMQ — works on serverless                                                                 |
| Scheduled jobs     | Vercel Cron                                                               | Native, no extra infra                                                                                |
| Payments           | Paystack (NGN only)                                                       | Nigeria's default. Flutterwave as backup                                                              |
| Notifications      | Termii (WhatsApp + SMS) + Resend (email)                                  | Single Nigerian provider for WA+SMS, billed in NGN                                                    |
| Storage            | Cloudflare R2 (large) + Vercel Blob (small)                               | R2 cheaper for video; Blob simpler for avatars                                                        |
| AI                 | DeepSeek-V3/R1 (primary) + OpenAI gpt-4o-mini (fallback) + optional local | Sprint 6 migrated from Anthropic for cost. See [apps/web/lib/ai/README.md](apps/web/lib/ai/README.md) |
| Search             | Meilisearch Cloud                                                         | Fast typo-tolerant search                                                                             |
| Analytics          | PostHog Cloud + Sentry                                                    | Product + error tracking                                                                              |
| Ads                | Google AdSense (free tier only)                                           | Display ads for free-tier monetization                                                                |

## Repository layout

```
apps/
  web/          Student PWA + API routes (Vercel project #1, port 3000)
  admin/        Admin dashboard (Vercel project #2, port 3001)
packages/
  db/           Drizzle schema, migrations, seed
  shared/       Zod schemas, TypeScript types, constants
  ui/           shadcn/ui components + theme tokens
  notifications/ Termii + Resend providers + template registry + QStash scheduling
  config/       Shared ESLint, TypeScript, Tailwind configs
docker-compose.yml  Local Postgres + Redis + Meilisearch
```

## Local development setup

Target: clone-to-running in 30 minutes.

### Verified setup

The following toolchain has been confirmed end-to-end (`pnpm install`, `pnpm db:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm build` all green):

| Tool        | Version                          | Notes                                    |
| ----------- | -------------------------------- | ---------------------------------------- |
| Node        | 20.x or newer (tested on 25.8.2) | `.nvmrc` pins to 20                      |
| pnpm        | 9.12.0                           | Pinned via `packageManager` field        |
| Docker      | 29.x (tested on 29.3.1)          | For local Postgres + Redis + Meilisearch |
| Turborepo   | 2.9.x                            | Auto-installed by pnpm                   |
| Next.js     | 14.2.x                           | App Router                               |
| Drizzle Kit | 0.25.x                           | Generates migrations                     |

`pnpm install` resolves ~1050 packages and completes in ≈60 seconds on a warm cache, ≈3 minutes cold.

### Prerequisites

- **Node.js 20+** (`.nvmrc` pins major version)
- **pnpm 9+** (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- **Docker** for local Postgres / Redis / Meilisearch
- **Git** with line endings set to LF (`.gitattributes` enforces)

### Steps

```bash
# 1. Clone
git clone https://github.com/your-org/examready-ng.git
cd examready-ng

# 2. Install dependencies (≈90s)
pnpm install

# 3. Boot local services (Postgres + Redis + Meilisearch)
docker compose up -d

# 4. Copy env file. Local dev fills in only what's needed for local DB.
cp .env.example apps/web/.env.local

# 5. Edit apps/web/.env.local — minimum required for local dev:
#    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/examready
#    DIRECT_URL=postgresql://postgres:postgres@localhost:5432/examready
#    LOCAL_DEV=true
#    DEV_AUTH_BYPASS=true
#    NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 (placeholder)
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
#    SUPABASE_SERVICE_ROLE_KEY=placeholder

# 6. Generate Drizzle migration files from schema (first run only)
pnpm db:generate

# 7. Apply migrations (auto-applies the local auth.users stub when LOCAL_DEV=true)
pnpm db:migrate

# 8. Seed sample data — 10 exams, 22 subjects, 17 topics, 50 JAMB questions
pnpm db:seed

# 9. Start dev servers (web on :3000, admin on :3001)
pnpm dev
```

Visit:

- Student app: <http://localhost:3000>
- Admin: <http://localhost:3001>
- Drizzle Studio: `pnpm db:studio` → <https://local.drizzle.studio>
- Meilisearch UI: <http://localhost:7700>

### Local auth bypass

Authentication flows (Supabase phone OTP via Termii) cannot be exercised locally — they require a live Supabase project + Termii account. For local frontend work:

1. Set `DEV_AUTH_BYPASS=true` in `apps/web/.env.local`
2. The seed script creates a test user with id `00000000-0000-0000-0000-000000000001`
3. Pass `x-dev-user-id: 00000000-0000-0000-0000-000000000001` on every request to authed endpoints

For real auth testing, point the env vars at a shared **Supabase staging project** (see [Deployment](#deployment)).

### Resetting local state

```bash
# Wipe and restart everything
docker compose down -v
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

## Environment variables

Every key is documented in `.env.example` at the repo root. Production values live in Vercel's environment config UI — never commit secrets.

Categories:

- **Runtime**: `NODE_ENV`, `LOCAL_DEV`, `DEV_AUTH_BYPASS`
- **Database**: `DATABASE_URL` (pooler, port 6543), `DIRECT_URL` (unpooled, for migrations)
- **Supabase**: `SUPABASE_URL`, anon key, service-role key, Auth Hook secret
- **Upstash**: Redis REST URL/token, QStash token + signing keys
- **Termii**: API key, sender ID, WhatsApp device ID
- **Resend**: API key, from-email
- **Paystack**: secret + public keys
- **AI**: OpenAI + Anthropic API keys
- **Analytics**: PostHog + Sentry DSN
- **Storage**: R2 credentials, Vercel Blob token
- **Cron**: `CRON_SECRET` — `openssl rand -hex 32`

## Database

### Schema

22 tables organized by domain (see `packages/db/src/schema/`):

- **Identity**: `users` (1:1 with `auth.users`), `target_exams`
- **Catalog**: `exams`, `subjects`, `topics` (self-referencing for subtopics)
- **Content**: `questions` (with `media` jsonb and `search_text` generated column), `options`
- **Practice**: `attempts`, `attempt_answers`, `bookmarks`
- **Billing**: `subscriptions`, `payments` (amounts in kobo, integer)
- **Notifications**: `notification_log`
- **Ads**: `ad_impressions` (bigserial PK)
- **Social**: `study_groups`, `study_group_members`, `ready_points_log`, `referrals`

### Migrations

Three sources, applied in order by `pnpm db:migrate`:

1. `migrations/local/*.sql` — local dev only, creates the `auth.users` stub
2. `migrations/*.sql` — Drizzle-generated, tracked in `_journal.json`
3. `migrations/extras/*.sql` — hand-written:
   - `0001_auth_link.sql` — FK to `auth.users` + `on_auth_user_created` trigger
   - `0002_updated_at_trigger.sql` — auto-bump `updated_at` columns
   - `0003_rls_baseline.sql` — enable RLS, public-read policies for catalog tables

After every schema change in `packages/db/src/schema/*.ts`:

```bash
pnpm db:generate    # produces a new migrations/<timestamp>_*.sql
pnpm db:migrate     # applies it
```

### Local dev RLS

Local Postgres connects as the `postgres` superuser, which automatically bypasses Row Level Security. RLS policies are still applied to the schema and exercised in CI integration tests, but they don't constrain day-to-day local development. In production, our API uses Supabase's service-role connection (also `BYPASSRLS`); RLS is enforced only on Supabase Realtime channels and direct frontend queries via the anon key.

### Seed

`packages/db/seed/seed.ts` is idempotent. It inserts:

- 10 exams (JAMB UTME, WAEC, NECO, Post-UTME, GCE, NABTEB, ICAN, JUPEB, IELTS, SAT)
- 22 subjects (15 for JAMB, 5 for WAEC, 2 for NECO)
- 17 topics (10 JAMB Math, 7 JAMB English)
- 50 sample JAMB questions (25 Math + 25 English) drawn from 2019–2023 papers, difficulties 2–4

Bulk-import of real past papers comes through the admin CSV import tool (later sprint), not this seed.

## Deployment

### Vercel projects

Create **two** Vercel projects from this repo:

1. **examready-web** — root directory `apps/web`. Includes API routes + cron jobs. Deploys to `examready.ng`.
2. **examready-admin** — root directory `apps/admin`. Deploys to `admin.examready.ng`.

For each project:

1. **Connect Git**: link to your GitHub repo, set production branch to `main`.
2. **Environment variables**: paste from `.env.example` (production values only). Mark `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `CRON_SECRET`, etc. as encrypted.
3. **Cron jobs** (web only): `apps/web/vercel.json` declares 4 schedules (daily reminders, weekly summary, streak rollover, subscription check). Free tier supports 2 crons; upgrade to Pro plan for all 4.
4. **Domains**: configure via Vercel UI.

### Supabase

1. Create a project at <https://supabase.com/dashboard/projects>
2. Copy **URL**, **anon key**, **service role key** into Vercel env config
3. Set `DATABASE_URL` to the **Transaction Pooler** connection (port 6543) and `DIRECT_URL` to the **Direct Connection** (port 5432) — see Project Settings → Database → Connection string
4. Run migrations against the production database from a developer machine:
   ```bash
   DATABASE_URL=$PROD_POOLER DIRECT_URL=$PROD_DIRECT pnpm db:migrate
   ```
5. **Auth → Providers**: enable Phone (Twilio or any provider — credentials don't matter, hook overrides)
6. **Auth → Hooks → Send SMS Hook**: enable, point at `https://examready.ng/api/webhooks/supabase/send-sms`, copy the secret to `SUPABASE_AUTH_HOOK_SECRET`
7. **Auth → Providers → Google**: enable, paste `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from Google Cloud Console

### Upstash

1. Create a **Redis** database at <https://console.upstash.com> in EU region (close to Supabase EU). Copy REST URL + token.
2. Create a **QStash** queue (free tier supports 500 messages/day; upgrade per scale). Copy current + next signing keys.

### Cloudflare R2

1. Create an R2 bucket named `examready-media` for question images, video uploads, and PDFs
2. Generate API token with read/write access; copy to `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`

## Third-party integrations

### Termii (WhatsApp + SMS)

1. Sign up at <https://accounts.termii.com>
2. Verify business — provide CAC certificate and Director's NIN/passport
3. Apply for **WhatsApp Business API** access (Termii dashboard → WhatsApp). Approval typically takes 5–10 business days.
4. **Submit WhatsApp templates for approval** — required before sending. The full list of templates we use is in `packages/notifications/src/templates/registry.ts`. Submit all of them in one batch:
   - `otp_code` (transactional)
   - `welcome` (utility — English + Pidgin variants)
   - `daily_reminder` (utility)
   - `streak_alert` (utility)
   - `weekly_summary` (utility)
   - `payment_success` (transactional)
   - `payment_failed` (transactional)
   - `subscription_expiring` (utility)
   - `subscription_expired` (utility)
   - `exam_countdown` (utility)
   - `referral_qualified` (utility)
   - `mock_result` (utility)
   - `admin_broadcast` (marketing)

   Each template's exact body is in the registry file. Once approved, paste each template's id into the matching `whatsappTemplateId` field.

5. Copy `TERMII_API_KEY`, `TERMII_SENDER_ID`, `TERMII_WHATSAPP_DEVICE_ID` to env config.

### Paystack

1. Create a business account at <https://dashboard.paystack.com>
2. **Settings → Webhooks**: add `https://examready.ng/api/webhooks/paystack`. Paystack signs every request with HMAC-SHA512 of the body using your **secret key** as the HMAC key.
3. **Plans**: create three recurring plans:
   - Basic Monthly — ₦2,500 / month
   - Pro Monthly — ₦5,000 / month
   - Pro Annual — ₦25,000 / year
     Copy each plan code into `PAYSTACK_PLAN_BASIC_MONTHLY`, `PAYSTACK_PLAN_PRO_MONTHLY`, `PAYSTACK_PLAN_PRO_ANNUAL`.
4. Test the webhook end-to-end with a ₦100 charge in test mode before flipping live keys. The handler is functional in Sprint 0 (`apps/web/lib/webhooks/paystack.ts` and `apps/web/app/api/webhooks/paystack/route.ts`).

### Resend (email)

1. Sign up at <https://resend.com>
2. Verify domain `examready.ng` — add DKIM, SPF, DMARC records to DNS
3. Generate API key, copy to `RESEND_API_KEY`
4. Set `RESEND_FROM_EMAIL=hello@examready.ng`

### Google AdSense

AdSense application + approval is the longest-lead-time integration. Apply early — typical approval takes 2-4 weeks.

#### Application checklist

Before applying:

- [ ] Privacy policy page published at `/privacy` (✅ included)
- [ ] Terms of service page published at `/terms` (✅ included)
- [ ] About page at `/about` (✅ included)
- [ ] Contact page at `/contact` with WhatsApp and email (✅ included)
- [ ] Site has 50+ pages of original content (you'll need real questions seeded — bulk-import enough past papers first)
- [ ] Site has been live with consistent traffic for 30+ days (run a soft launch first)
- [ ] Site is mobile-friendly (✅ — designed mobile-first)
- [ ] Site loads quickly (✅ — Next.js + lazyOnload AdSense)
- [ ] No prohibited content (we have none)
- [ ] Domain ownership verified

#### After approval

1. Copy publisher ID to `NEXT_PUBLIC_ADSENSE_CLIENT_ID` (format: `ca-pub-XXXXXXXXXXXXXXXX`)
2. Create **3 ad units** in AdSense:
   - Dashboard sidebar (300×250 medium rectangle)
   - Between practice questions (336×280 large rectangle)
   - Above results explanations (336×280 large rectangle)
3. Copy each slot id into the matching env var:
   - `NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD_SIDEBAR`
   - `NEXT_PUBLIC_ADSENSE_SLOT_BETWEEN_QUESTIONS`
   - `NEXT_PUBLIC_ADSENSE_SLOT_RESULTS_TOP`
4. Fill in `apps/web/public/ads.txt` with the line AdSense provides
5. Verify site again in AdSense dashboard

#### How our AdSlot is built (compliance-aware)

`apps/web/components/ads/AdSlot.tsx` enforces:

- **Free-tier only** — basic and pro subscribers see no ads (paid for it)
- **Age 13+** — under-13 users blocked at signup; AdSlot returns null if age is missing or <13
- **Non-personalized for minors** — users 13–17 get `data-tag-for-under-age-of-consent="1"` on every ad
- **CLS = 0** — width/height reserved in CSS so no layout shift when ads load
- **Lazy load** — `<Script strategy="lazyOnload">`, never blocks page interactivity
- **Consent gate** — NDPR/GDPR banner via `ConsentBanner.tsx` before AdSense loads (rejection hides ads entirely)
- **Frequency** — 1 ad per 10 questions, never mid-question

The admin dashboard (later sprint) will have a **kill switch** to globally disable ads if AdSense flags the account.

## Observability

### Sentry (errors)

Server- and client-side error tracking. Wired into the API handler error
boundary via `apps/web/lib/observability/sentry.ts` — every unhandled
error fires `captureException` with PII redacted via `redactPii()`. Set
`SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client) to enable;
missing keys = no-op, no errors shipped anywhere.

What's filtered before send:

- `event.user` reduced to `{ id }` only — email, IP, username blanked
- Request headers stripped entirely (auth tokens live there)
- Request body recursively redacted by key (`phone`, `email`, etc.) and
  by content (Nigerian E.164 phones and email regex match → `[redacted]`)
- App contexts redacted; runtime + OS contexts kept (PII-free)

Dashboard: see Sentry project settings → Issues. Recommend setting up
alerts for new-issue and regression notifications to a Slack channel.

### PostHog (product analytics)

Browser-side event tracking + feature flags. Wired in
`apps/web/lib/observability/posthog.ts`. Tracks ONLY this allowlist of
events:

- `signup_started`, `signup_completed`, `onboarding_completed`
- `attempt_started`, `attempt_submitted`
- `subscription_purchased`
- `ad_impression`
- `ai_tutor_query`
- `consent_choice`

`autocapture` and `session_recording` are **disabled** — explicit events
only, no surprise data. `sanitize_properties` runs every property bag
through `redactPii()` before it leaves the browser.

User identification uses Supabase `auth.users.id` (random UUID) only —
never phone, email, or name. Calling `resetIdentity()` on logout clears
the distinct id.

Feature flags: use `useFeatureFlag('flag-name')`. Defaults to false until
PostHog responds, so design components to treat false + undefined the
same.

### Required env vars

- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`

## Operations runbook

### Health check

`GET /api/health` — pings DB and Redis, returns 503 if either fails. Wire your uptime monitor here.

### Common ops

| Task                           | Command            |
| ------------------------------ | ------------------ |
| Apply DB migration             | `pnpm db:migrate`  |
| Generate migration from schema | `pnpm db:generate` |
| Re-seed local DB               | `pnpm db:seed`     |
| Open Drizzle Studio            | `pnpm db:studio`   |
| Lint everything                | `pnpm lint`        |
| Typecheck everything           | `pnpm typecheck`   |
| Run all tests                  | `pnpm test`        |

### Disabling ads globally

Until the admin kill switch ships, you can disable all AdSense by removing `NEXT_PUBLIC_ADSENSE_CLIENT_ID` from Vercel environment variables and redeploying. The `<AdSenseScript>` component returns null without that var; every `<AdSlot>` follows.

### Verifying Send SMS Hook ↔ Termii path

The OTP delivery flow has multiple moving parts. Smoke test:

```bash
# 1. From frontend or curl, request OTP
curl -X POST https://staging.examready.ng/api/auth/phone/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+2348012345678"}'

# 2. Confirm:
#    a) supabase.auth.signInWithOtp succeeded (no 502)
#    b) Send SMS Hook fired (Supabase dashboard → Auth → Hooks → Logs)
#    c) /api/webhooks/supabase/send-sms received the call (Vercel function logs)
#    d) Termii sent the message (Termii dashboard → Messages)
#    e) notification_log row created with status='sent'

# 3. Verify your phone got the WhatsApp message with the 6-digit code

# 4. Submit it
curl -X POST https://staging.examready.ng/api/auth/phone/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"+2348012345678","code":"123456"}'
```

If WhatsApp delivery fails, the user can tap "Send via SMS" — that calls `/api/auth/phone/resend` which sets a Redis flag the hook reads to force SMS.

## Architecture decisions

Recorded here so future you knows why we made these calls.

### Why Next.js Route Handlers, not Fastify

Originally proposed Fastify; switched because Fastify on Vercel requires running it as a single Node lambda which loses Vercel's edge optimizations. Route Handlers run as proper serverless functions per route. Trade-off: less rich plugin ecosystem; we built our own `defineRoute()` composer.

### Why Drizzle, not Prisma

Drizzle ships TypeScript-native — no codegen step, no separate process to keep in sync. Faster cold starts on Vercel (no Prisma binary). We accept slightly less mature ecosystem.

### Why bigserial for ad_impressions and ready_points_log

These tables will dominate row counts at scale. Bigint indexes are ~4× more compact than UUID indexes — meaningful when the table grows past 100M rows.

### Why amount stored as kobo (integer), not naira

Money in floating point is a footgun. Store kobo (integer) everywhere, convert to display naira at the UI boundary. Column is named `amount_kobo` (not `amount_ngn`) to make the unit obvious.

### Why public.users.id == auth.users.id (FK + trigger)

The `on_auth_user_created` trigger guarantees a `public.users` row exists for every `auth.users` row. No race window where a JWT is valid but the profile is missing. Cascade delete from `auth.users` cleanly removes all user data — single-statement GDPR delete.

### Why 1-deep notification fallback (not chained)

If WhatsApp fails synchronously (Termii returns "not on whatsapp"), we try SMS in the same request. We deliberately don't chain to email after SMS fails — multi-hop fallbacks make debugging hard and the user has already waited. If both Termii channels fail, the user is shown a message and can request resend manually.

## Security & privacy

- **Phone-first identity** — primary user identifier is the Nigerian phone number. Email is optional.
- **No BVN/NIN** — we are not a fintech. KYC is minimal.
- **Age gate** — users under 13 cannot register (COPPA + AdSense policy)
- **Non-personalized ads for minors** (13–17) — `data-tag-for-under-age-of-consent="1"`
- **No private DMs between students** — study groups are moderated, group chat only
- **No real-money features** — Ready Points are non-redeemable
- **NDPR-aware data handling** — see `/privacy` for full disclosure
- **Webhook signature verification** is mandatory:
  - Paystack: HMAC-SHA512 of raw body
  - Supabase: Standard Webhooks v1 (HMAC-SHA256)
  - Termii: provider signature (real verification added when production account is wired)
- **Rate limits everywhere**:
  - Auth: 5 OTP / phone / 10min, 20 / IP / hour
  - User endpoints: 120/min
  - Answer endpoint: 1200/min (mock CBT pace)
  - Admin: 300/min
- **CSP** — strict allowlist in `apps/web/vercel.json`. AdSense, Paystack, Supabase, Termii, PostHog, Sentry only.
- **No secrets in URLs** — Paystack `paystack_reference` UNIQUE makes webhook idempotent without leaking refs

## Sprint 0 status

✅ **Foundations**:

- Monorepo (pnpm + Turborepo)
- Drizzle schema (22 tables, indexes, partial indexes for hot queries)
- Migrations (generated + extras for FK / triggers / RLS baseline)
- Seed (50 JAMB questions across 17 topics)
- Zod schemas + types in `packages/shared`
- shadcn/ui component library in `packages/ui`
- Termii + Resend providers in `packages/notifications` with 13 templates registered

✅ **API (29 routes)**:

- Auth: 5 (request-otp, verify, resend, google, logout)
- Catalog: 3 (exams, subjects, topics)
- Practice/attempts: 5 (questions/practice, attempts CRUD, submit)
- Me: 7 (me, dashboard, onboarding, notifications, bookmarks×3)
- Webhooks: 3 (Paystack functional, Supabase Send SMS Hook functional, Termii stub)
- Cron: 4 stubs (handlers land in notifications sprint)
- Admin: 1 (test notification send)
- Health: 1

✅ **Frontend**:

- Marketing pages (landing, pricing, about, contact, privacy, terms)
- Auth + onboarding wizard (5 steps, age 13+ gate)
- Dashboard with aggregated stats + weak-topics heatmap
- Practice runner with timer + flag + AdSlot insertion
- Results page with breakdown
- Settings → notifications
- AdSlot infrastructure (tier-aware, age-aware, CLS=0, consent-gated)
- PWA manifest, robots.txt, sitemap.xml

✅ **Admin shell** — login + sidebar nav + 6 stub pages.

✅ **Deployment configs** — `vercel.json` (4 cron jobs, full security headers + CSP), `docker-compose.yml` (Postgres + Redis + Meilisearch).

⏳ **Deferred to subsequent sprints**:

- AI tutor backend (chat, essay grading, study plan generator)
- Paystack subscription init flow + frontend
- Real Termii delivery receipt handling
- Live leaderboards (Supabase Realtime channel)
- Study groups
- Flashcards (SM-2 algorithm)
- Meilisearch indexing pipeline
- Sentry + PostHog wiring (env vars present, code stubs)
- Parent/guardian linked accounts (schema column present)
- Bursary application flow
- Admin question CRUD + CSV bulk import
- Admin broadcast composer
- Cron handler real implementations

## Contributing

1. Branch from `main`, name `feat/<short-name>` or `fix/<short-name>`
2. Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.) — enforced by Husky + commitlint
3. Lint + typecheck must pass: `pnpm lint && pnpm typecheck`
4. PR description: what changed, why, how to test

## License

UNLICENSED — proprietary, all rights reserved.
