# Changelog

All notable changes to ExamReady.ng. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Sprint 2 work (in progress) — see git log for partial Sprint 2 deliverables

## [Sprint 7] — 2026-05-08 — Editorial factory + JAMB-fidelity CBT engine + web ingestion

### Added — editorial factory infrastructure

- New `apps/web/lib/ingestion/` library: extractors (PDF via pdf-parse, DOCX via mammoth, HTML/text via cheerio, image stub for Phase-2.1 vision), heuristic + DeepSeek classifier, six pipelines (questions / syllabus / universities / course-combinations / cutoffs / reference), batched enricher (5 items/call, ~0.6 cache-hit ratio assumed), DeepSeek self-audit pass with adversarial system prompt and pipeline-specific dimensions. Cost helper at `cost.ts`.
- Schema (migration 0009): 9 new tables — universities, courses, university_courses, cutoff_marks, reference_content, extraction_jobs, ingestion_jobs, editorial_audit_log, scraping_cache. Every domain row carries source_path/source_url for provenance.
- CLIs: `pnpm inventory`, `pnpm editorial-factory` (flags `--pipeline`, `--dry-run`, `--use-ai`, stage-selection, `--force`), `pnpm web-ingest`.
- Admin shell at `/admin/editorial` (six pipeline cards + audit-verdict legend).
- Documentation: EDITORIAL_FACTORY_README.md, WHEN_PAST_QUESTIONS_ARRIVE.md.

### Added — JAMB-fidelity CBT engine

- Full-screen exam runner at `/cbt/[attemptId]` (lives outside `(app)` route group). Top bar with candidate/subject/timer/Q counter. Right sidebar with color-coded palette + 9-key cheat sheet.
- 9-key keyboard navigation (NON-NEGOTIABLE): A/B/C/D pick, P previous, N next, R clear, K calculator (NOT C — that's option-C), S submit. F additive flag.
- `JambCalculator.tsx` — pure-React floating draggable calculator. 4-function + memory + sqrt + percent. No advanced functions (matches JAMB's permitted set exactly).
- `QuestionPalette.tsx` — color-coded grid; click jumps, right-click flags.
- Server-authoritative timer (5-min amber, 1-min red, auto-submit at 0:00). localStorage snapshot every 10s.
- Schema (migration 0010): `attempt_mode` extended with `cbt_mock_full`, `cbt_mock_subject`, `past_paper`. New `exam_paper_specs` table.
- `/cbt/keyboard-help` printable cheat sheet.

### Added — web ingestion

- `lib/ingestion/scrapers/fetch.ts` — polite HTTP wrapper (SSRF allow-list, cache lookup, robots.txt, 10/min rate limit, 7-day cache TTL). UA: `ExamReadyBot/0.1 (+https://examready.ng/bot)`.
- Six scrapers: Wikipedia (live), JAMB/WAEC/NECO/NUC/Myschool (scaffolded with notes).

### Added — topic lessons

- Schema (migration 0011): `topic_lessons` + `user_lesson_progress`.
- Public route `/lessons/[examSlug]/[subjectSlug]/[topicSlug]` with Schema.org JSON-LD.

### Added — DeepSeek cost optimisation

- Redis cache for `/api/ai/explain-differently` (`ai:explain:<questionId>:<level>`, TTL 7 days). Pidgin not cached.

### Documentation

- API_COSTS.md Appendix C (editorial factory per-item costs).
- STAGING_BRINGUP.md "Sprint 7 additions" section.
- SESSION_REPORT.md updated to Sprint 7.

### Changed

- `materials/` folder added to .gitignore.

### Honest deferrals

- Per-pipeline **parser prompts** deliberately deferred until first real source data lands. Pipelines emit 0 rows + scaffold notes today rather than fabricate.
- Vision pipeline (Phase 2.1), mobile-CBT bottom-sheet polish, `/admin/editorial/run` endpoint, `/admin/lessons/queue` moderation UI, OG-image generation per lesson.

## [Sprint 6] — 2026-05-06 — DeepSeek-only + AI Examiner + Predicted Score

### Security

- **Critical**: admin role check switched from client-mutable `user_metadata.role` to server-only `app_metadata.role` in both apps/web/lib/auth/session.ts and apps/admin/lib/auth/server.ts. Without this, any signed-in user could promote themselves to admin via `auth.updateUser({data:{role:'admin'}})`.
- **High**: cron Bearer token verification migrated to `crypto.timingSafeEqual` to remove a timing-attack vector on `Authorization: Bearer ${CRON_SECRET}`.
- **Medium**: RLS extended to all Sprint 4-6 tables (study_plans, ai_usage_log, ai_feedback, app_settings, exam_waitlist, consent_log, target_exams, bulk_generation_jobs, theory_attempts) via `0004_rls_extend_sprint6.sql`. exam_waitlist gets a public-INSERT policy for /coming-soon.
- Full audit report in AUDIT_REPORT.md.

### Changed

- **AI provider strategy** retired the Sprint 5 hybrid in favour of DeepSeek-V3 for everything, with OpenAI gpt-4o-mini as emergency fallback. Anthropic provider commented out (kept as dead code for future re-introduction). Local inference (LOCAL_AI_ENABLED) added as opt-in for non-critical features only.
- **Pidgin** feature-flagged off via `PIDGIN_ENABLED` env var (default false). Code, prompts, routing all retained. `/api/ai/explain-differently` rejects level=pidgin with `FEATURE_DISABLED` 404 when unset; ExplanationCard hides the dropdown option behind `NEXT_PUBLIC_PIDGIN_ENABLED`.
- **Hero copy + features** repositioned to lead with the new moat. Three hero variants stored inline (default = "Get exam-grade feedback before you sit the exam.") for future PostHog A/B test.

### Added

- **AI Examiner** (`POST /api/ai/grade-theory`) — grades WAEC/NECO theory answers against marking_guide via DeepSeek-R1 reasoner. Returns per-criterion marks + 1-paragraph overall feedback + 3 specific suggested improvements. Persists to new `theory_attempts` table.
- **Predicted Score** (`GET /api/me/predicted-score`) — pulls 90 days of attempts, weights accuracy by topic frequency, applies trend adjustment, maps to exam-specific score band (JAMB 0-360, WAEC/NECO 9-grade A1-F9). Returns INSUFFICIENT_DATA below 50 samples. Optional 1-paragraph DeepSeek interpretation cached 24h.
- **`step_by_step`** explain-differently level — replaces UX gap left by hiding Pidgin. Numbered steps, max 6, one sentence each.
- **Bulk question generation pipeline** — `POST /api/admin/questions/bulk-generate` creates parent job + fans out one QStash worker per topic; `POST /api/admin/jobs/generate-questions-batch` is the worker; new `bulk_generation_jobs` table tracks aggregate progress. `/admin/questions/bulk-generate` page provides the form UI.
- **WAEC SSCE + NECO SSCE catalog promotion** — `coverage_status='beta'`, isActive=true. International exams (IELTS/TOEFL/SAT/GRE/Duolingo) set to `coverage_status='hidden'` and excluded from /api/exams.
- **Topic seed data** — ~80 new topic entries with 1-2 sentence descriptions covering all 9 active JAMB subjects + WAEC/NECO Math/English/Bio/Chem/Physics.
- **Theory question fields** on `questions` table — `marking_guide` jsonb (array of {point, marks}), `max_marks` smallint, `sample_excellent_answer` text.
- **Reviewer attribution** — `approved_by` + `approved_at` on questions for tracking who approved which question (reviewer payment + audit).
- **`CoverageBadge`** component (BETA / COMING_SOON variants).
- **`/api/health/ai`** probes DeepSeek + OpenAI + local; returns 503 when DeepSeek down so external monitors can page.
- **`/api/admin/bulk-generation-jobs`** + `/api/admin/waitlist` admin GET endpoints (UI deferred — see OPEN_QUESTIONS.md).
- **5 new FAQ entries** on AI Examiner accuracy, Predicted Score basis + trustworthiness, JAMB applicability, school-assignment use case.
- **Preflight script** (`pnpm --filter @examready/web preflight`) — env vars + service health check before deploy.
- **Launch docs**: TERMII_FINISH.md, PAYSTACK_GO_LIVE.md, STAGING_BRINGUP.md, plus a rewrite of LAUNCH_CHECKLIST.md with status tags + leverage-sorted Top 10.
- **/blog** routes — `lib/blog.ts` markdown loader with frontmatter, `/blog` index page, `/blog/[slug]` dynamic page with Article schema. Sitemap.ts updated.
- **10 SEO-targeted blog articles** in `apps/web/content/blog/` covering JAMB UTME 2026, WAEC SSCE timetable, NECO June 2026, Post-UTME cut-offs, JAMB subject combinations, How to score 300+ in JAMB, WAEC vs NECO comparison, JAMB CBT walkthrough, JAMB Math top 10 topics, Post-UTME by university.

### Schema migrations

- `0008_funny_killraven.sql` — coverage_status enum gains 'beta' + 'hidden'; questions gets approved_by/approved_at/marking_guide/max_marks/sample_excellent_answer; new bulk_generation_jobs + theory_attempts tables.
- `extras/0004_rls_extend_sprint6.sql` — RLS on Sprint 4-6 tables (apply with `psql -f` directly; not auto-applied).

### Deferred (logged in OPEN_QUESTIONS.md / SESSION_REPORT.md)

- Next.js 14 → 15 migration. Hard gate before open-signup launch. Mitigated by Cloudflare + per-route rate limits during private beta.
- Termii webhook signature verification — needs production Termii Business account + sender approval to know the signature scheme.
- Practice runner UI for theory questions ("Submit & Grade" path on theory question_type) — endpoint works; user-facing surface deferred to user-driven UI sprint.
- Predicted Score dashboard widget — endpoint works; dashboard card deferred.
- Live progress monitor + waitlist admin pages — APIs exist, UI deferred.
- Bulk-approve + filters in moderation queue — `approved_by` columns shipped; queue page integration deferred.
- @vercel/og dynamic blog OG images — standard og:image meta + default image works for initial launch.
- Lit/Govt/Econ/Geo/History/CRK/Agric topic trees for WAEC + NECO — admin can populate via /admin/topics or bulk-generate.

### Notes

- Cumulative cost reduction Sprint 4 → Sprint 6: -66% at every DAU tier.
- New env vars: `OPENAI_API_KEY`, `PIDGIN_ENABLED`, `NEXT_PUBLIC_PIDGIN_ENABLED`, `LOCAL_AI_ENABLED`, `LOCAL_AI_BASE_URL`, `UPSTASH_QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`. Removed (commented): `ANTHROPIC_API_KEY`.
- New deps: openai (already added Sprint 5), gray-matter, marked, tsx (devDep), dotenv (devDep).

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
