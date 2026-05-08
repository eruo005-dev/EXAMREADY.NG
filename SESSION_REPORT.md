# Session Report — Sprint 7 (Editorial factory + CBT engine + web ingestion)

**Session date:** 2026-05-08
**Sprint 7 base commit:** Sprint 6 final (`9c25d9a` — staging migration ESM + PG-version compat)
**Predecessor report:** Sprint 6 content moves into CHANGELOG.md.

---

## What this sprint did, by phase

| Phase | Scope                                                                                                                                 | Status                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1     | Inventory CLI (`pnpm inventory`) + EDITORIAL_FACTORY_README + .gitignore for materials/                                               | ✅ shipped (commit `aa2a243`) |
| 2     | Editorial factory infrastructure: 9 schemas + audit + enricher + 6 pipelines + CLI + admin panel + cost docs                          | ✅ shipped (commit `64c2a57`) |
| 3     | Web ingestion — scraping cache + robots.txt + rate-limit + 6 scrapers (Wikipedia working; JAMB/WAEC/NECO/NUC/Myschool scaffolded)     | ✅ shipped (commit `80ce317`) |
| 4     | JAMB-fidelity CBT engine — 9-key keyboard nav + JAMB calculator + question palette + server-authoritative timer + /cbt/keyboard-help  | ✅ shipped (commit `ccff729`) |
| 5     | DeepSeek cost optimisation — Redis cache for /api/ai/explain-differently (~$0 vs ~$0.0004 per call on cache hits)                     | ✅ shipped (commit `eabf8d6`) |
| 6     | Topic lessons schema (`topic_lessons` + `user_lesson_progress`) + public /lessons/[exam]/[subject]/[topic] route + Schema.org JSON-LD | ✅ shipped (commit `eabf8d6`) |
| 7     | Staging integration test runbook updates in STAGING_BRINGUP.md                                                                        | ✅ shipped                    |
| 8     | README + CHANGELOG + LAUNCH_CHECKLIST + WHEN_PAST_QUESTIONS_ARRIVE.md + this report                                                   | in progress                   |

---

## Strategic context (the user asked for in the brief)

The brief locked four decisions before any code:

1. **Past questions hadn't arrived yet** — Sprint 7 builds the editorial factory infrastructure now so the moment a JAMB / WAEC / NECO past-paper PDF lands in `materials/`, the user runs `pnpm editorial-factory` and content flows. The pipelines emit 0 rows today by design rather than fabricate.
2. **DeepSeek as a high-volume editorial worker.** Pipelines + audit are all on `deepseek-chat` (V3); critical conversational features stay on `deepseek-reasoner` (R1). See [API_COSTS.md](API_COSTS.md) Appendix C for per-item economics.
3. **CBT mirrors JAMB exactly.** Every key, every visual cue, every keyboard shortcut maps 1:1 with the actual JAMB CBT interface (and matches what students recognise from ExamGuide / FlashLearners / TestDriller). The 9-key canon (A/B/C/D/P/N/S/R/K) is non-negotiable.
4. **DeepSeek self-audit is the moat.** Adversarial system prompt + per-pipeline dimensions + critical-flag list. Target: 60-70% auto-approval, ~$0.0001 audit cost per item.

---

## What landed end-to-end

### Schemas (migrations 0009 + 0010 + 0011)

11 new tables across the editorial factory + CBT + lessons surfaces:

```
universities, courses, university_courses, cutoff_marks, reference_content
extraction_jobs, ingestion_jobs, editorial_audit_log, scraping_cache
exam_paper_specs (CBT)
topic_lessons, user_lesson_progress
```

Plus enum extensions: `attempt_mode` gains `cbt_mock_full`, `cbt_mock_subject`, `past_paper`. `university_type`, `ingestion_pipeline`, `ingestion_status`, `extraction_status`, `audit_verdict`, `reference_content_kind`, `lesson_status` enums introduced.

Every domain row carries a `source_path` / `source_url` for provenance. The `editorial_audit_log` table is the canonical reviewer trail.

### Editorial factory (Phase 1 + 2)

`apps/web/lib/ingestion/`:

- `extractors/` — pdf-parse for PDF, mammoth for DOCX, cheerio for HTML, image stub for vision (Phase 2.1 deferred). The `pdf-parse/lib/pdf-parse.js` deep-import sidesteps the package's debug branch under ESM.
- `classify.ts` — 11 categories × 16 heuristic rules + optional DeepSeek fallback for borderline (< 70). Runs free on heuristics for the typical case.
- `audit.ts` — DeepSeek self-audit; thresholds 85/70 with critical-flag override; cost ~$0.0001/item.
- `enricher.ts` — 5-item batches, ~0.6 cache-hit ratio assumption.
- `pipelines/` — six implementations (questions, syllabus, university, course-combinations, cutoff, reference) each conforming to the same `Pipeline<T>` interface. Today they return 0 rows + scaffold notes; the parser DeepSeek prompt is the only thing missing per pipeline.
- `cost.ts` — pricing table + `estimateCost()` accounting for cache-hit ratio.

CLIs:

- `pnpm inventory` — Phase 1 scanner; emits `materials-inventory.md`.
- `pnpm editorial-factory [--pipeline NAME] [--dry-run] [--use-ai]` — Phase 2 runner; emits `editorial-results-<ts>.md`.
- `pnpm web-ingest --source <name> --type <kind>` — Phase 3 web scraper.

Admin surface: `/admin/editorial` shell with six pipeline cards + audit-verdict legend (live data wiring deferred to Phase-7 follow-up endpoint).

### CBT engine (Phase 4)

`apps/web/components/cbt/`:

- `CbtRunner.tsx` — full-screen JAMB-fidelity exam UI. Top bar with candidate / subject / timer / Q counter. Main panel renders passage + stem + 4-option radio with letter pills. Right sidebar holds the palette + colour legend + 9-key cheat sheet. Bottom action bar mirrors JAMB exactly.
- `JambCalculator.tsx` — pure-React 4-function + memory + sqrt + percent calculator. Floating draggable. K toggles, Esc closes. NO advanced functions (sin/cos/log) — those would build habits the real exam doesn't allow.
- `QuestionPalette.tsx` — colour-coded grid (green=answered, yellow=flagged, blue=current, gray=unanswered). Right-click toggles flag.

Server-authoritative timer (extrapolated from `attempts.startedAt + timeLimitSeconds`); pulse states at 5 min (amber) and 1 min (red); auto-submit at 0:00. localStorage snapshot every 10s for network-resilience.

Routes:

- `/cbt/[attemptId]` — server component, auth-gated, fetches attempt + questions + options + subjects, hands to client runner.
- `/cbt/keyboard-help` — printable cheat sheet; reachable from runner + marketing.

### Web ingestion (Phase 3)

`apps/web/lib/ingestion/scrapers/`:

- `fetch.ts` — single polite HTTP wrapper. SSRF allow-list (default + `ALLOWED_SCRAPE_ORIGINS` env) → cache lookup → robots.txt check → 10/min rate limit → fetch → 2xx-only cache write with 7-day TTL.
- `index.ts` — six scraper definitions. Wikipedia is wired and parses the public List_of_universities_in_Nigeria page via cheerio. JAMB / WAEC / NECO / NUC / Myschool are scaffolds with explicit notes on why they aren't live yet (PHP redirects, PDF-only sources, ToS concerns) and the recommended workflow for each.

### Cost optimisation (Phase 5)

`/api/ai/explain-differently` now hits Redis (`ai:explain:<questionId>:<level>`, TTL 7 days) before going to DeepSeek. Cache HIT logs as `provider='deepseek', model='cache-hit'` so the existing `/admin/ai-quality-review` dashboards count it as a successful upstream call without polluting the fallback rate. Pidgin level deliberately not cached (review-gated content stays uncached). Sprint 5 prompt-cache shape was already compliant — every prompt is a module-level constant ≥ 200 tokens.

### Topic lessons (Phase 6)

Schema in place. Public route `/lessons/[examSlug]/[subjectSlug]/[topicSlug]` server-rendered with breadcrumb nav, Schema.org Article + LearningResource JSON-LD, "Practice this topic" CTA. Today the route 404s for all paths because `topic_lessons` is empty — generation lights up the moment the syllabus pipeline (Phase 3) lands real `topics` rows.

---

## Build state

- `pnpm -r typecheck` — green across all 9 packages.
- `pnpm db:generate` — three migrations generated: 0009 (factory schema), 0010 (CBT enum + exam_paper_specs), 0011 (topic_lessons + user_lesson_progress).
- `pnpm inventory` — runs clean against the 17 PDFs in user's local materials/ folder; 14/17 high-confidence classifications, 3 borderline routed to manual-review-needed (mono.pdf, poly.pdf, unı.pdf — likely school lists; flag for `--use-ai` re-classification).
- `pnpm editorial-factory --dry-run --max 3` — runs end-to-end, emits report, no DB writes.

---

## Materials inventory of the user's local stash

The 17 files in `materials/` (not committed) cover:

| Category              | Count | Recommended pipeline                 |
| --------------------- | ----: | ------------------------------------ |
| `course-requirements` |    12 | `ingest-as-course-combinations`      |
| `past-questions`      |     2 | `ingest-as-questions`                |
| `unknown`             |     3 | manual review (re-run with --use-ai) |

Two past-paper files already present (`JAMB-Biology-Past-Questions-and-Answers.pdf`, `2918040275896_post-utme-past-questions-and-answers...`). When the user fills in the questions-pipeline parser prompt, those flow through the pipeline as the first real production batch.

The 12 JAMB faculty brochures are course-combinations gold — once the brochure parser prompt lands they populate `courses` + `university_courses` + `universities` (cross-referenced with the Wikipedia scraper).

---

## Honest limitations / deferrals

These are scoped and clearly signalled in the relevant code or docs:

- **No live AI calls in this session.** Pipelines emit 0 rows by design until parser prompts are filled in — exactly what the brief asked for ("skip rather than fake"). The Phase-2 audit + enricher modules are wired and will start firing the moment a parser produces output.
- **Vision pipeline (Phase 2.1).** `apps/web/lib/ingestion/extractors/image.ts` is a stub. When a scanned PDF lands and `extractor.hasUsableText === false`, the file is currently logged but not processed. Wiring DeepSeek-vl2-chat (or OpenAI gpt-4o-mini vision fallback) is a focused follow-up.
- **Per-pipeline parser prompts.** Each pipeline has its enrichment + audit prompt in place; the **parser** prompt (raw text → structured JSON) is the one piece deliberately deferred until real source data lands. The Phase-7 follow-up runbook in EDITORIAL_FACTORY_README + WHEN_PAST_QUESTIONS_ARRIVE.md walks the user through landing them.
- **Mobile CBT styling (Phase 4.8).** Current layout is desktop-first. Palette + calculator render on phone but bottom-sheet treatment is the next polish layer. A tablet works today.
- **Past Paper Mode public route** (`/past-papers/[examSlug]/[year]/[subjectSlug]`) — the `attempt_mode='past_paper'` enum value is in place; the route lands alongside the first ingested past-paper questions.
- **Subject-specific UI** (KaTeX for Math, diagrams for Phys/Chem, Lit prescribed-text panel) — wired through `CbtQuestion.passage/options`; renderers are the next layer.
- **`/admin/editorial` action buttons** are disabled pending the `/api/admin/editorial/run` endpoint. The CLI is the canonical runner today.
- **`/admin/lessons/queue` moderation UI** is deferred — schema is in place, generator wraps existing question-gen patterns once topics are populated.
- **OG-image generation per lesson** (same @vercel/og pattern blog posts will eventually use) — not on Sprint 7's critical path.

---

## What this is NOT

- **Not a content release.** Sprint 7 is the FACTORY that turns source files into content. The first batch of real content lands when:
  1. The user drops past-paper PDFs into `materials/`, OR
  2. The user runs `pnpm web-ingest --source jamb --type syllabus` (once the JAMB scraper stabilises), OR
  3. A reviewer runs the queue.
     Until then, the database carries the same Sprint-6 seed (39 exams, 148 topics, 122 questions).
- **Not a Vercel deploy.** Sprint 7 ships in scaffold form on git; deployment is unchanged from the Sprint-6 staging baseline at `examready-ng-admin.vercel.app`.

---

## Recommended IMMEDIATE next actions for the user

In priority order:

### 1. Apply migrations 0009 + 0010 + 0011 to staging Supabase (10 min)

```bash
DIRECT_URL="<staging-direct-url>" pnpm --filter @examready/db migrate
```

Three new migrations land 11 new tables + several enum extensions. The migrate CLI is idempotent.

### 2. Smoke-test the CBT engine (15 min)

Follow STAGING_BRINGUP.md "Sprint 7 additions — CBT engine smoke test". The keyboard-only path (A/B/C/D + P/N/R/K/F/S) is the load-bearing user flow.

### 3. Drop the first past-paper PDFs in materials/ (whenever ready)

Follow [WHEN_PAST_QUESTIONS_ARRIVE.md](WHEN_PAST_QUESTIONS_ARRIVE.md) top-to-bottom. The JAMB Biology past-paper PDF already sitting in `materials/` is a perfect test case — the pipeline classifies it correctly today (90% confidence) and emits zero rows safely. Filling in the parser prompt + re-running converts it into questions.

### 4. Hire content reviewer (start hiring this week — same advice as Sprint 6)

₦100-200k budget, ~60 hours over 2-3 weeks. They work the moderation queue with the J/K/A/R/E shortcuts (same as Sprint 5; Sprint 7's audit pre-filter cuts queue size by ~60-70%).

### 5. Wire `/api/admin/editorial/run` endpoint (1-2 hours, follow-up sprint)

Currently the editorial factory + CLI are operator-only. The admin UI's trigger buttons are disabled because the server endpoint that would call the CLI's main() doesn't exist. Adding it is mechanical: stream the per-file outcomes via Supabase Realtime so the admin sees live progress.

---

## Final note

Sprint 7 was the infrastructure sprint. Sprint 8 (when needed) is the
content sprint — fill in the parser prompts, run the factory at scale,
work the queue. Engineering pauses here.

Source files of truth for follow-up work:

- [EDITORIAL_FACTORY_README.md](EDITORIAL_FACTORY_README.md) — pipeline shape + workflow
- [WHEN_PAST_QUESTIONS_ARRIVE.md](WHEN_PAST_QUESTIONS_ARRIVE.md) — runbook for the user
- [STAGING_BRINGUP.md](STAGING_BRINGUP.md) — staging smoke-tests for CBT + factory
- [API_COSTS.md](API_COSTS.md) — per-item economics + sprint envelope
