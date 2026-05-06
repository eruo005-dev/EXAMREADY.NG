# Changelog

All notable changes to ExamReady.ng. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Sprint 2 work (in progress) — see git log for partial Sprint 2 deliverables

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
