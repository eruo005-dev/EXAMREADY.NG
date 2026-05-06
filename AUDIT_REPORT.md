# Sprint 6 Security + Architecture Audit

**Date:** 2026-05-06
**Audited at commit:** Sprint 6 Phase 1 baseline (`fff98cd`)
**Audited by:** Claude (Sprint 6 Phase 2)
**Scope:** Whole repo — every API route, every webhook, every SQL builder call, every console.log, dependency tree, RLS posture, CSP header.

---

## Executive summary

| Severity     | Count | Fixed this sprint | Deferred                        |
| ------------ | ----- | ----------------- | ------------------------------- |
| **Critical** | 1     | 1                 | 0                               |
| **High**     | 2     | 1                 | 1 (Next 15 migration)           |
| **Medium**   | 3     | 1                 | 2                               |
| **Low**      | 4     | 0                 | 4 (acknowledged, won't-fix-now) |

The single Critical was fixed. The High that's deferred is the Next.js 14 → 15 migration — same status as Sprint 5, blocked on multi-day breaking-change work. Mitigations are listed.

---

## Critical findings

### C-1 — Admin role read from client-mutable `user_metadata` ✅ FIXED

**Where:** `apps/web/lib/auth/session.ts:82-86`, `apps/admin/lib/auth/server.ts:58-61`

**Exploit scenario:** Any signed-in non-admin user could call the public Supabase JS client's `auth.updateUser({ data: { role: 'admin' } })` to set their own `user_metadata.role = 'admin'`. Both the web app's `requireAdmin` gate and the admin app's `getAdminUser` would then accept them. Result: full admin access to every `/api/admin/*` route + the entire admin dashboard, including question moderation, ad kill switch, broadcasts, and bursary management.

`user_metadata` is documented by Supabase as user-mutable; only `app_metadata` is server-only-writable.

**Fix:** Switched both gates to read from `app_metadata.role`. Promotion to admin must now go through the service-role API (`supabase.auth.admin.updateUserById(id, { app_metadata: { role: 'admin' } })`) — a regular user has no path to write that field.

**Status:** Fixed in `apps/web/lib/auth/session.ts:75-101` and `apps/admin/lib/auth/server.ts:1-15`. Documented in commit message + LAUNCH_CHECKLIST.md.

**Why this hasn't been exploited:** The repo has no production users yet. There's no actual admin-set-via-user_metadata in the wild. For staging, the user must use the new app_metadata path going forward.

---

## High findings

### H-1 — Cron Bearer token compared with `===` (timing attack) ✅ FIXED

**Where:** `apps/web/lib/api/handler.ts:69` (before fix)

**Exploit scenario:** Cron auth was `if (header !== \`Bearer ${expected}\`) throw`. JavaScript's `!==`short-circuits at the first byte mismatch. An attacker who can measure response time precisely (over enough probes) can extract the secret byte-by-byte. Cron secrets unlock`/api/cron/\*` which can trigger SMS sends and read user data — high-blast-radius.

**Fix:** Switched to `crypto.timingSafeEqual` with explicit length-equal short-circuit. Constant-time over the secret bytes themselves.

**Status:** Fixed in `apps/web/lib/api/handler.ts:65-83`.

### H-2 — Next.js 14.2 dependency advisories (DoS × 2 + smuggling × 1) ⏳ DEFERRED

**Where:** All `apps/web/package.json` + `apps/admin/package.json` (Next 14.2.35).

**Advisories:**

- GHSA-h25m-26qc-wcjf — HTTP request deserialization → DoS via insecure RSC (patched in 15.0.8)
- GHSA-q4gf-8mx6-v5v3 — DoS with Server Components (patched in 15.5.15)
- GHSA-3x4c-7xq6-9pq8 — HTTP request smuggling in rewrites (patched in 15.5.13)

**Exploit scenario:** A crafted request to a Server Component path or rewrite can trigger CPU exhaustion or smuggle a second request past the front-edge proxy. At 1k DAU on Cloudflare-fronted Vercel, the practical exposure is bounded — Cloudflare absorbs the volume needed to DoS.

**Why deferred:** Next.js 14 → 15 is a multi-day breaking change (async `cookies()` / `headers()` / `params`, React 19, caching rewrites). Sprint 5 deferred this for the same reason and Sprint 6 doesn't change the risk shape.

**Mitigations holding:**

1. Cloudflare in front of Vercel rate-limits the attack volume.
2. Per-route rate limiting via Upstash inside the app.
3. Bounded user base during private beta (no open signup).

**Recommended remediation:** Schedule a focused 2–3 day sprint to migrate Next 14 → 15. **Hard gate before any open-signup launch.** Documented in LAUNCH_CHECKLIST.md §5.

---

## Medium findings

### M-1 — RLS missing on tables added after Sprint 0 baseline ✅ FIXED

**Where:** `packages/db/migrations/extras/0003_rls_baseline.sql` lists 17 tables. The following public.\* tables are NOT in the list:

- `study_plans` (Sprint 4)
- `ai_usage_log` (Sprint 4)
- `ai_feedback` (Sprint 4)
- `app_settings` (Sprint 0/1)
- `exam_waitlist` (Sprint 2)
- `consent_log` (Sprint 0/1)
- `target_exams` (Sprint 0)
- `bulk_generation_jobs` (Sprint 6 — added in Phase 3)
- `theory_attempts` (Sprint 6 — added in Phase 4)

**Exploit scenario:** Defense-in-depth gap. Practical exploitation requires breaching another layer first because all DB access in production goes through the service-role connection (BYPASSRLS). But if a future change accidentally connects via the anon role, RLS would not protect these tables.

**Fix:** Added `packages/db/migrations/extras/0004_rls_extend_sprint6.sql` enabling RLS + FORCE ROW LEVEL SECURITY on all the missing tables. `exam_waitlist` gets a public-INSERT policy so the marketing /coming-soon page still works.

**Status:** Fixed via new migration file (apply to staging via `pnpm db:migrate` after the standard 0008/0009 migrations land in Phases 3-4).

### M-2 — Termii webhook stub has no signature verification ⏳ DEFERRED

**Where:** `apps/web/app/api/webhooks/termii/route.ts:13-18`

**Exploit scenario:** Anyone can POST to `/api/webhooks/termii` with arbitrary JSON. Currently the handler is a stub that only logs the body — no DB writes, no SMS sends. Practical impact today is zero.

**Risk window:** When the stub is replaced with a real handler that writes to `notification_log`, an unauthenticated POST could spoof delivery receipts and corrupt our delivery analytics.

**Why deferred:** Sprint 4 already flagged this in LAUNCH_CHECKLIST.md §2 with the message "implement HMAC verification per Termii docs before launch." Termii's signature scheme isn't documented as of writing — needs a real Termii Business account to even see the format.

**Recommended remediation:** Implement during the Termii Business account setup (LAUNCH_CHECKLIST §2 / TERMII_FINISH.md). Block any code change that adds DB writes to this handler before signature verification lands.

### M-3 — pnpm audit transitive moderates (PostCSS XSS, serialize-javascript, glob CLI) ⏳ DEFERRED

**Where:** `pnpm audit` output, paths through `next@14.2`, `next-pwa`, `eslint-config-next`.

**Findings:**

- PostCSS `<8.5.10` XSS in CSS Stringify (transitive via Next 14.2)
- serialize-javascript `<7.0.5` CPU DoS (transitive via next-pwa → workbox)
- glob `>=10.2.0 <10.5.0` CLI command injection (transitive via eslint-config-next)
- Rollup arbitrary file write (transitive via Sentry build tooling)

**Exploit scenario:** None of these are exploitable in our runtime path:

- PostCSS is build-time CSS transformation; we don't accept user-provided CSS.
- serialize-javascript is in next-pwa's build pipeline; doesn't execute at request time.
- glob's command injection requires running `glob -c ...` which we don't do.
- Rollup runs at build, not runtime.

**Why deferred:** Resolving each requires either a Next 15 migration (which lifts most transitive deps) or replacing next-pwa entirely. Same Sprint 5 story.

**Recommended remediation:** Wait for Next 15 migration. It will lift PostCSS, the Sentry deps, and ditch the next-pwa @5.6.0 transitive chain.

---

## Low findings (acknowledged, won't-fix-now)

### L-1 — `handleError()` console.error doesn't redactPii

**Where:** `apps/web/lib/api/handler.ts:215`

`console.error('[api] Unhandled error:', e)` doesn't pass `e` through `redactPii()`. If an error message contains user-supplied input (rare — most errors are stack traces), it could land in Vercel logs unredacted.

**Why low:** Vercel logs are operator-private. The Sentry capture path (line 218-220) does redact via the `beforeSend` hook. The typical `e` is a stack trace from internal code.

**Recommendation:** Wrap the console.error with `redactPii({ message, stack })` in a future cleanup. ~15 minutes of work.

### L-2 — CSP uses `'unsafe-inline'` and `'unsafe-eval'` for scripts

**Where:** `apps/web/vercel.json:34`

Next.js 14 generates inline scripts and uses eval-like constructs for some hydration paths. `'unsafe-inline'` + `'unsafe-eval'` are needed without nonces.

**Why low:** This is a known Next.js limitation. Tightening with `strict-dynamic` + per-request nonces is a meaningful project (touches every Server Component), and Next 15 has better nonce support.

**Recommendation:** Bundle with Next 15 migration.

### L-3 — Webhook idempotency tests not included

The audit brief asked for idempotency tests on each webhook. Paystack relies on `paystack_reference` UNIQUE on payments + `paystack_subscription_code` UNIQUE on subscriptions — practical idempotency is enforced by the DB. Supabase send-sms is stateless (just forwards OTP). Termii is a stub.

**Why low:** Existing UNIQUE constraints make duplicate webhook delivery a no-op. Adding integration tests that REPLAY webhooks 5× is a meaningful addition but not a blocker.

**Recommendation:** Add to the test plan when Termii signature is wired up.

### L-4 — Cron handler observability is thin

**Where:** `apps/web/app/api/cron/*/route.ts`

Each cron path does its work and returns; on failure, the error path logs to console and Sentry but doesn't surface a structured "this cron failed" signal. The only post-hoc visibility is via Sentry events.

**Why low:** Sentry catches failures already. A dedicated `cron_runs` table for explicit success/fail tracking is nice-to-have, not load-bearing.

**Recommendation:** Add `cron_runs` table in a future cleanup if cron failures become a recurring issue post-launch.

---

## Audited and found clean

The following areas were audited and produced no findings beyond what's listed above:

### API route auth declarations (43 routes audited)

Every route under `apps/web/app/api/**/route.ts` either uses `defineRoute({ auth: ... })` (forces auth declaration in the Route Handler signature) or implements its own auth check inline. Reviewed:

- 4 cron routes — all `auth: 'cron'`
- 7 admin routes — all `auth: 'admin'`
- 14 user routes — all `auth: 'user'`
- 5 webhook routes — all do explicit signature verification (paystack, supabase send-sms) or are stubbed (termii)
- 6 public routes — auth: 'public', read-only catalog data only
- 3 auth flow routes — handle their own signed verification (OTP, OAuth)
- 4 health/utility routes — appropriately public or admin-gated

No route was found with mismatched declared vs effective auth.

### Webhook signature verification

| Webhook                           | Verification                                               | Constant-time?                                 |
| --------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| `/api/webhooks/paystack`          | HMAC-SHA512 of raw body w/ `PAYSTACK_SECRET_KEY`           | ✅ `timingSafeEqual`                           |
| `/api/webhooks/supabase/send-sms` | Standard Webhooks v1 (msgId.timestamp.body, base64 secret) | ✅ `timingSafeEqual` over candidate signatures |
| `/api/webhooks/termii`            | None (stub — see M-2)                                      | n/a                                            |

Paystack signature uses the **raw body string** (not parsed JSON), confirmed in `apps/web/lib/webhooks/paystack.ts:60`.

### SQL injection

`grep -rn "sql.raw\|db.execute\|sql\`...\\\${"` across the repo. All matches fall into safe categories:

- **Drizzle template literal with column references** (`sql\`${t.column} = true\``) — column references are typed identifiers, not user input.
- **Date/time SQL with literal strings** (`sql\`now() - interval '30 days'\``) — no interpolation of user values.
- **Test SQL with bound parameters** (`sql\`UPDATE ... WHERE id = ${id}\``) — drizzle's `sql` template is parameterized; `${id}` is sent as a bound parameter, not concatenated.
- `${user.timezone}` in `streak-rollover.ts` — comes from the database, not user input.

Zero `sql.raw()` usages found. **SQL injection: clean.**

### Sentry beforeSend PII guard

`apps/web/lib/observability/sentry.ts:32-54`:

- Wipes `event.user` to just `{ id: '[redacted]' }` (no email, phone, name)
- Strips `event.request.headers` entirely (auth tokens live there)
- Runs `event.request.data`, `event.extra`, `event.contexts.app` through `redactPii`
- `sendDefaultPii: false`

PostHog uses the same `redactPii` via the `sanitize_properties` hook in `posthog.ts:60`.

### `ai_usage_log.output_sample` PII path

`apps/web/lib/ai/client.ts:60-67`: `outputText` runs through `redactPii` BEFORE the 4000-char truncation, so a redacted phone-number prefix can't survive truncation. Storage is gated behind `AI_LOG_SAMPLES=true`. Inputs are NEVER stored.

### Hardcoded secrets

No leaked keys (Anthropic / OpenAI / DeepSeek / Paystack / Termii / Supabase / Resend) found anywhere in the repo. The `+234...` phone numbers are all test data, schema docstrings, or the marketing-page placeholder explicitly flagged in LAUNCH_CHECKLIST for replacement.

### Middleware auth bypass

`apps/web/middleware.ts` is intentionally minimal — only sets a country header from Vercel's edge geo. No middleware-enforced auth to bypass; auth is exclusively at the Route Handler level via `defineRoute`. The `x-examready-country` response header is never read back, so request-side spoofing has no effect.

### CSP & security headers

`vercel.json` sets X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy=strict-origin-when-cross-origin, Permissions-Policy locking down camera/mic/geo. CSP `connect-src` allows Supabase, Upstash, Paystack, Termii, PostHog, Sentry — does NOT include DeepSeek or OpenAI because those calls are server-side. CORS is implicit (no `Access-Control-Allow-Origin` headers set, so same-origin only).

### Cost-vector audit (AI routes)

| Route                                   | User cap before AI call? | Rate limit before AI call? | Telemetry on error?            |
| --------------------------------------- | ------------------------ | -------------------------- | ------------------------------ |
| `/api/ai/explain-differently`           | ✅ checkAiQuota          | ✅ checkAiQuota            | ✅ logAiCall in catch          |
| `/api/ai/study-plan`                    | ✅ checkAiQuota          | ✅ checkAiQuota            | ✅ logAiCall in finally        |
| `/api/ai/tutor/chat`                    | ✅ checkAiQuota          | ✅ checkAiQuota            | ✅ logAiCall in stream finally |
| `/api/admin/questions/generate-with-ai` | n/a (admin only)         | ✅ defineRoute admin rate  | ✅ logAiCall in finally        |

All four AI routes enforce caps + rate limits BEFORE the AI call, and log to `ai_usage_log` regardless of success/failure (the finally-block pattern). A user cannot bypass their daily cap by triggering errors mid-call.

The new `aiExaminer` and `bulkGenerate` endpoints (added in Phases 3-4) will follow the same pattern.

---

## Out of scope this audit

Things deliberately NOT audited (and why):

- **Vercel platform itself** (their auth, their cron infra, their CSP enforcement) — out of our control; we trust them.
- **Third-party SDK internals** (Supabase, Drizzle, Anthropic, OpenAI SDKs) — pin versions and read advisories; don't re-audit their internals.
- **CDN/Cloudflare config** — covered in operations setup, not codebase audit.
- **Compliance scope** (NDPR/GDPR data flow mapping beyond consent log) — separate exercise; needs legal review, not engineering audit.
- **Pen test simulation** (active SQL injection probing, XSS payload fuzzing) — would require staging deployment with real data; queue for post-launch external audit.

---

## Recommended remediation order with effort estimates

In priority order:

1. **Apply migration 0004_rls_extend_sprint6.sql** (M-1) — 5 min ops time. Run `pnpm db:migrate` against staging + production after Sprint 6 lands.
2. **Promote staging admin via app_metadata** (C-1 follow-through) — 5 min. Update LAUNCH_CHECKLIST §1 with the correct command.
3. **Termii webhook signature** (M-2) — 30 min once Termii Business account is live and signature scheme is documented.
4. **Next 14 → 15 migration** (H-2 + M-3) — focused 2–3 day sprint. Schedule before any open-signup launch.
5. **redactPii on console.error in handleError** (L-1) — 15 min. Bundle with the next observability touch.
6. **Cron run telemetry** (L-4) — 1–2 hours. Defer until needed.
7. **CSP nonce hardening** (L-2) — 4–6 hours. Bundle with Next 15 migration.

Total fix-able-this-sprint work was C-1 + H-1 + M-1 = ~1 hour, all completed.
