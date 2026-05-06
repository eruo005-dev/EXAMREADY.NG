# Changelog

All notable changes to ExamReady.ng. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Sprint 2 work (in progress) — see git log for partial Sprint 2 deliverables

## [Sprint 5] — 2026-05-06 — DeepSeek hybrid integration

### Added

- **Provider abstraction layer** (`apps/web/lib/ai/providers/`) — `AiProvider` interface with `completion`, `stream`, `toolUse`; Anthropic adapter (existing SDK); DeepSeek adapter (`openai` SDK pointed at `api.deepseek.com/v1`). `runWithFallback(primary, fallback, op)` handles automatic retry on retryable failures.
- **Hybrid feature routing** in `lib/ai/constants.ts` — DeepSeek primary for explain-differently (simpler/analogy), study-plan, admin question generation; Claude primary for tutor (Sonnet) and Pidgin explain (Haiku, **no fallback** so the moat can't silently degrade).
- **`ai_usage_log.provider` + `was_fallback`** columns (migration `0007_petite_mariko_yashida.sql`) — per-call provider tracking with default-backfilled `'anthropic'` for old rows.
- **`/admin/ai-quality-review`** now shows per-provider breakdown and per-sample provider/fallback badges.
- **`GET /api/health/ai`** (admin) — pings both providers with a 4-token request, returns latency + status.
- **Integration tests:** 5 DeepSeek tests, 3 cross-provider shape-equivalence tests, 4 fallback-wrapper unit tests (mocked, always run).
- **`apps/web/lib/ai/README.md`** — routing rationale, architecture, "how to add a third provider" runbook.
- **`API_COSTS.md`** rewritten — hybrid projections (~39% saving at every DAU tier vs. all-Claude) + full-DeepSeek appendix.
- **`DEEPSEEK_API_KEY`** in `.env.example`; LAUNCH_CHECKLIST.md updated with the DeepSeek vendor section.
- New dependency: `openai@^6.36.0` (used only by the DeepSeek adapter).

### Changed

- **Prompt tuning** for DeepSeek's verbose default — explicit length constraints in explain-differently ("4–6 sentences, 2 paragraphs max"), required-field language in study-plan ("All 7 days must be present"), format constraints in generate-questions ("EXACTLY 4 options A, B, C, D").
- All four AI route handlers (`/api/ai/tutor/chat`, `/api/ai/explain-differently`, `/api/ai/study-plan`, `/api/admin/questions/generate-with-ai`) migrated to the provider abstraction. The Pidgin path returns 503 with a "try a different style" hint when Anthropic Haiku fails — no silent DeepSeek call.
- Tool definitions (`STUDY_PLAN_TOOL`, `GENERATE_QUESTIONS_TOOL`) now expose plain JSON-Schema in a `schema` field; each provider adapter wraps to its native shape.

### Fixed

- Sprint 4 known issue: `lib/ai/__tests__/explain-differently.integration.test.ts` no longer fails at module load when `DATABASE_URL` is unset. Now imports `AI_MODELS` from `lib/ai/constants.ts` (no DB dependency) instead of `lib/ai/client.ts`. Skips correctly when `ANTHROPIC_API_KEY` is unset.

### Notes

- Tutor stays on Claude Sonnet 4.6. Pidgin stays on Claude Haiku 4.5. DeepSeek's Pidgin output is unverified — running PIDGIN_SAMPLES.md against DeepSeek is the gate for any future "full-switch to DeepSeek" sprint.

## [Sprint 4] — 2026-05-06 — launch readiness (engineering)

### Security

- **drizzle-orm 0.34 → 0.45.2** to patch SQL-injection advisory GHSA-5c6j-r48x-rmvq
- Audited auth gates, rate limits, secrets, webhook signatures across all routes — no leaks, no missing gates

### Added

- **`ai_feedback` table** + `(user_id, ai_usage_log_id)` UNIQUE upsert for thumbs-up/down on AI outputs
- **`ai_usage_log.output_sample`** column — opt-in via `AI_LOG_SAMPLES=true` env, PII-redacted, 4000-char cap
- **`POST /api/ai/feedback`** + `GET /api/ai/feedback` for thumbs feedback (with self-row check)
- **`GET /api/admin/ai-quality`** — 14-day per-feature summary + redacted samples
- **`/admin/ai-quality-review`** page surfacing volume, thumbs ratio, and sample text per AI feature
- **`ExplanationCard`** component combining the explain-differently dropdown + thumbs UI; wired into the results page
- **J/K/A/R/E keyboard shortcuts** on `/admin/questions/ai-queue` (focus ring, scroll-into-view, input-skip)
- **Migration `0006_worthless_stryfe.sql`** covering the schema additions

### Documentation

- **API_COSTS.md** — per-feature unit cost + DAU projections at 1k/10k/100k under an 80/15/5 free/basic/pro mix
- **LAUNCH_CHECKLIST.md** — manual ops tasks (vendor accounts, DNS, real-phone verification, Lighthouse) consolidated for tick-box run-through
- **PIDGIN_SAMPLES.md** — template for the 15-test Pidgin quality verification suite (4-axis rubric, sample template)
- **PRODUCTION_BUGS.md** — postmortem template (empty until production traffic)

### Deferred

- Next.js 14 → 15 migration — two open DoS advisories on 14.2; mitigated for private beta by Cloudflare + per-route rate limits; hard gate before open-signup launch (queued for a focused session)
- Termii webhook signature verification — flagged in LAUNCH_CHECKLIST.md
- Production deploy + 550-question generation run + 15-test Pidgin suite — all need real credentials/accounts; queued for the manual launch-checklist run

## [Sprint 3] — 2026-05-06 — AI features

See git history at commit `98edaf8` and prior SESSION_REPORT.md content (preserved in repo history) for full detail. Highlights:

- 4 AI endpoints: explain-differently (3 levels including the Pidgin moat), tutor chat (streaming), study-plan (tool_use), admin generate-with-AI
- Two-layer quota: Redis throughput + DB daily caps (tier-aware)
- Per-feature model selection in `AI_MODELS` (Sonnet 4.6 for tutor/study/generate, Haiku 4.5 for explain)
- 30 new tests (15 prompt-construction + 15 integration, key-gated)
- Admin moderation queue (`/admin/questions/ai-queue`) with hard-delete on reject

## [Sprint 1] — 2026-05-06

### Added

- **Build verified end-to-end** — `pnpm install`, `pnpm db:generate`,
  `pnpm typecheck`, `pnpm lint`, `pnpm build` all green; verified setup
  documented in README with toolchain pins
- **Safety-net tests** — UNIQUE NULL email defense + heatmap query plan
  defense (EXPLAIN ANALYZE asserts no seq scans on attempts /
  attempt_answers); CI workflow (`.github/workflows/ci.yml`) with
  postgres service runs them on every PR
- **Cron handlers brought to functional state** — daily-reminders fires
  every 5min with [now-2min, now+3min] bucket per user timezone +
  notification_log idempotency; weekly-summary, streak-rollover,
  subscription-check all implemented; pure-JS unit tests for time math
- **Admin question CRUD endpoints** — POST/PATCH/DELETE/GET /api/admin/
  questions, POST /api/admin/questions/import (CSV up to 1000 rows
  / 5MB) with row-level error reporting; CSV format docs and sample
- **Admin question management UI** — searchable list, new-question form
  with cascading exam→subject→topic selects and type-aware option
  inputs, edit page, drag-drop CSV import; admin auth gate via
  Supabase user_metadata.role === 'admin'
- **AdSense slot mapping + admin kill switch** — placement-based AdSlot
  (dashboard_sidebar, practice_interstitial, results_top, footer_banner)
  with per-placement env vars; app_settings table + ads-toggle admin
  page for ops-controlled disable
- **User-facing copy** — FAQ page (19 questions across 5 sections),
  error message translations (lib/utils/error-messages.ts), email HTML
  rendering (table-based, brand-colored), founder-bio placeholder,
  landing hero "Pass JAMB. Pass WAEC. Pass everything."
- **NDPR/GDPR consent banner upgrade** — three-option (Accept all /
  Reject non-essential / Customize) with audit log to consent_log
  table; cookies policy page documenting every cookie + opt-out paths
- **Sentry + PostHog** — both lazy-loaded, both pass through redactPii()
  before send (7 unit tests for the redactor); allowlist of 9 trackable
  PostHog events, autocapture/session_recording disabled
- **Sample question bank** — 73 JAMB Math + 49 JAMB English questions
  with 3-5 sentence explanations
- **404 + error boundary polish** — Nigerian-voice 404 ("This page is
  not in the syllabus"), global error boundary with copyable Error ID
  and Sentry capture
- **GitHub housekeeping** — CODEOWNERS, PR template, issue templates
  (bug + feature), SECURITY.md disclosure policy, this CHANGELOG

### Changed

- AdSlot API: `slotId` prop dropped in favor of `placement`. Migration
  is invisible to call sites that switched to placement-based usage.
- defineRoute generic order: `defineRoute<S>(config)<TParams>(handler)`
  instead of multiple overloads; better Zod inference for body schemas

### Fixed

- Many initial-build issues — see commit `94f7a85`. Notable: `@types/node`
  added to packages/notifications, drizzle generated-column API, route
  group paths in admin URLs, theme.css dropped @layer wrapper

### Schema

- `users.streak_days` (smallint), `users.last_active_date` (date)
- `app_settings` (key/value/updated_at/updated_by_user_id)
- `consent_log` (append-only audit, ip hashed)
- 4 generated migrations + 3 hand-written extras (auth-link, updated_at
  trigger, RLS baseline) — all applied via `pnpm db:migrate`

## [Sprint 0] — 2025

### Added

- Initial monorepo (pnpm + Turborepo, 5 packages, 2 apps)
- Drizzle schema (22 tables) + 50-question seed
- Zod schemas + types in packages/shared
- shadcn-style component library in packages/ui
- Termii + Resend providers in packages/notifications, 13 templates
- 29 API routes (auth, catalog, attempts, me, webhooks, crons, admin)
- Marketing pages (landing, pricing, about, contact, privacy, terms)
- Auth + 5-step onboarding wizard
- Dashboard with weak-topics heatmap, practice runner with timer,
  results page with breakdown
- Admin app shell
- vercel.json with cron schedule + CSP, docker-compose.yml for local
- README with 30-minute setup, Termii template list, AdSense checklist
