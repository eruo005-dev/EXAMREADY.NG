# Editorial Factory

The editorial factory is ExamReady's content ingestion pipeline. It turns
raw source files (PDFs, DOCX, scraped HTML) into structured rows in the
database, with AI enrichment + AI self-audit, while staying inside a
$10-per-10,000-questions cost budget.

This README is the on-ramp. Every individual stage has its own module-level
JSDoc. Read those when you're working on a stage; read this when you want
to understand the whole system in 5 minutes.

---

## Pipeline shape

```
materials/                                 (raw source files; gitignored)
   │
   ▼
inventory-materials.ts        CLI: scan → categorise → write materials-inventory.md
   │
   ▼
extractors/                   PDF/DOCX/text/image → normalised text + metadata
   │
   ▼
classify.ts                   heuristic + optional DeepSeek tag → category + confidence
   │
   ▼
pipelines/                    ────────────────┬───────────────────────────
                              questions       │ syllabus
                              universities    │ courses
                              cutoffs         │ course-combinations
                              reference       │
   │
   ▼
enricher.ts                   batched DeepSeek-chat call: topic ID, difficulty,
                              explanation, worked solution, frequency score
   │
   ▼
audit.ts                      DeepSeek-chat self-audit pass
                              ≥85 ∧ no critical flag → auto-approved
                              70-84                  → human review queue
                              <70                    → rejected_by_audit
   │
   ▼
target tables                 questions / topics / universities / courses /
                              cutoff_marks  +  editorial_audit_log row per item
```

Every stage is **resumable**: a job table tracks per-file progress so a
restart picks up where the previous run left off. Every row in every
target table carries a `source_path` (or equivalent) provenance field —
no question, university or cutoff number is ever inserted without an
auditable origin.

---

## Pipelines

| Pipeline                        | Input shape                                        | Target tables                                 | Phase added |
| ------------------------------- | -------------------------------------------------- | --------------------------------------------- | ----------- |
| `ingest-as-questions`           | exam paper PDF (with answers)                      | `questions`, `options`, `editorial_audit_log` | 2           |
| `ingest-as-syllabus`            | official syllabus PDF / HTML                       | `topics`, `editorial_audit_log`               | 2           |
| `ingest-as-university-data`     | NUC / Wikipedia / aggregator HTML or list PDF      | `universities`, `editorial_audit_log`         | 2           |
| `ingest-as-course-combinations` | JAMB brochure / aggregator                         | `courses`, `university_courses`               | 2           |
| `ingest-as-cutoff-data`         | aggregator (Myschool, JAMB, university admissions) | `cutoff_marks`                                | 2           |
| `ingest-as-reference`           | study notes, blog source, exam-info pages          | `reference_content` (Phase 6 lessons)         | 2           |
| `manual-review-needed`          | unknown                                            | none — surfaces on `/admin/editorial`         | 2           |

The classifier (`apps/web/lib/ingestion/classify.ts`) decides which one
runs. Anything < 70 confidence gets routed to `manual-review-needed` so
a human can pick.

---

## Daily workflow — when source files arrive

1. **Drop files into `materials/`.**
   Keep the folder structure shallow and use clear filenames. Strong
   filename signals (e.g. `JAMB-Mathematics-2022-past-questions.pdf`)
   skip the DeepSeek classifier and save tokens.

2. **Run the inventory:**

   ```bash
   pnpm --filter @examready/web run inventory
   ```

   Open `materials-inventory.md`. Every file has a category, confidence
   number, and recommended pipeline. Skim and:
   - Rename anything obviously mis-classified (gives heuristic stronger signal).
   - For low-confidence files, re-run with `--use-ai`:
     ```bash
     pnpm --filter @examready/web run inventory -- --use-ai
     ```
     This calls DeepSeek-chat at ~$0.0001 per file for the borderline cases.

3. **Run the editorial factory** (Phase 2):

   ```bash
   pnpm --filter @examready/web run editorial-factory
   ```

   Or per-pipeline:

   ```bash
   pnpm --filter @examready/web run editorial-factory --pipeline questions
   pnpm --filter @examready/web run editorial-factory --pipeline syllabus --dry-run
   ```

   The factory is idempotent — interrupted runs resume from the
   `extraction_jobs` / `ingestion_jobs` table state.

4. **Watch progress at `/admin/editorial`.**
   Live counters per pipeline, cost so far, projected total. Buttons:
   - "Inventory materials/" — re-run inventory without leaving the UI.
   - "Process all materials" — kick off Step 3.
   - "Re-audit borderline outputs" — re-run the audit pass on items
     that scored 70-84 the first time.
   - "Re-enrich rejected questions" — re-run enrichment on items the
     audit pipeline rejected (often after a prompt update fixes the
     class of mistake that caused the rejection).

5. **Review queue.**
   - **Auto-approved** items show up in a sweep view; the reviewer
     skims for outliers using the J/K/A/R/E shortcuts (Sprint 5).
   - **Borderline (70-84)** items need a per-item decision (approve /
     edit / reject).
   - **Rejected by audit (<70)** items default to hidden but can be
     restored with one click + a re-enrich.

6. **Promote.**
   Once a target subject crosses the coverage threshold (e.g. 200+
   approved questions, 80% of topics covered), flip the exam's
   `coverage_status` from `beta` → `live` in the admin catalog.

---

## Sources we ingest in Sprint 7

| Source                                      | Pipeline                | Rate limit                  |
| ------------------------------------------- | ----------------------- | --------------------------- |
| User's `materials/` folder                  | router (heuristic + AI) | none                        |
| jamb.gov.ng (syllabuses, brochures)         | syllabus + universities | 10 req/min, 1s delay        |
| waec.org.ng                                 | syllabus                | 10 req/min, 1s delay        |
| neco.gov.ng                                 | syllabus                | 10 req/min, 1s delay        |
| Wikipedia (List of universities in Nigeria) | universities            | normal Wikipedia API limits |
| NUC (nuc.edu.ng)                            | universities            | 10 req/min                  |
| Aggregators (Myschool, AdmissionPlus, etc.) | cutoffs, combinations   | 10 req/min                  |

All scrapers honour `robots.txt`, cache responses in
`scraping_cache` to avoid re-fetching during dev iteration, and flag
any source that 403s for human review.

---

## DeepSeek self-audit — the cost-saving moat

After every pipeline produces output, a SECOND DeepSeek call runs the
audit. The audit prompt is intentionally adversarial — instructs the
model NOT to assume the previous output is correct, scores per-dimension,
and surfaces hard flags (e.g. "answer marked correct doesn't match the
explanation").

| Audit confidence | Status              | Visible in admin UI                              |
| ---------------- | ------------------- | ------------------------------------------------ |
| ≥ 85 (no flags)  | `auto_approved`     | sweep view — reviewer skims for outliers         |
| 70 – 84          | `needs_review`      | per-item review queue (priority sort)            |
| < 70             | `rejected_by_audit` | hidden by default; one-click restore + re-enrich |

Target throughput at launch: 60-70% of generated content auto-approves,
which means a reviewer's J/K/A queue runs ~3× shorter than without the
audit pass.

The audit's reasoning is stored in `editorial_audit_log` so the admin
UI can show "why did this get rejected?" without a re-run.

---

## Cost projections (per item, with 50% prompt cache hit)

| Item                          | DeepSeek-chat | DeepSeek-reasoner | Approx. cost |
| ----------------------------- | ------------- | ----------------- | ------------ |
| Question extracted + enriched | yes           | no                | ~$0.0010     |
| Question audited              | yes           | no                | ~$0.0002     |
| University record             | yes           | no                | ~$0.0003     |
| Cutoff record                 | yes           | no                | ~$0.0001     |
| Topic from syllabus           | yes           | no                | ~$0.0005     |
| Lesson generated (Phase 6)    | yes           | no                | ~$0.0040     |
| Self-audit per item           | yes           | no                | ~$0.0001     |

Rough sprint envelope:

- 10,000 questions fully processed: ~$10
- Full Nigerian university dataset (200 universities, ~5,000 courses,
  ~20,000 cutoff records): ~$5
- Full WAEC + NECO + JAMB syllabus tree (~33 subjects × ~15 topics each):
  ~$2
- 30 lesson generations (Phase 6 sample): ~$0.12

See [API_COSTS.md](API_COSTS.md) for the full breakdown.

---

## Where outputs land

| Pipeline                        | Tables written                                         |
| ------------------------------- | ------------------------------------------------------ |
| `ingest-as-questions`           | `questions`, `options`, `editorial_audit_log`          |
| `ingest-as-syllabus`            | `topics` (insert/upsert), `editorial_audit_log`        |
| `ingest-as-university-data`     | `universities`, `editorial_audit_log`                  |
| `ingest-as-course-combinations` | `courses`, `university_courses`, `editorial_audit_log` |
| `ingest-as-cutoff-data`         | `cutoff_marks`, `editorial_audit_log`                  |
| `ingest-as-reference`           | `reference_content` (Phase 6), `editorial_audit_log`   |

`extraction_jobs` and `ingestion_jobs` track in-flight work for resumability;
they're trimmed weekly by a cron defined in `apps/web/lib/cron/`.

---

## Admin surface

`/admin/editorial` is the operator console. All stages are visible there:

- **Pipeline status** card — live counts of items at each stage,
  per-stage spend, projected total.
- **Trigger actions** — re-run inventory, kick off the factory,
  re-audit borderline, re-enrich rejected.
- **Review queues** — auto-approved sweep, needs-review priority queue,
  rejected-by-audit (hidden by default).
- **Per-source filter** — drill into "show me everything from
  JAMB-Brochure-University-Faculty-of-Engineering.pdf".
- **Confidence range filter** — pull all items between 70 and 80 to spot-check.

All admin routes gate on `app_metadata.role === 'admin'` (Sprint 6
critical fix).

---

## CLI reference

```bash
# Phase 1 — scan & report
pnpm --filter @examready/web run inventory                  # heuristic only (free)
pnpm --filter @examready/web run inventory -- --use-ai      # call DeepSeek for borderline
pnpm --filter @examready/web run inventory -- --json        # also emit JSON

# Phase 2 — full factory run (idempotent, resumable)
pnpm --filter @examready/web run editorial-factory                              # all pipelines
pnpm --filter @examready/web run editorial-factory --pipeline questions         # single pipeline
pnpm --filter @examready/web run editorial-factory --extract --parse --enrich --audit  # specific stages
pnpm --filter @examready/web run editorial-factory --dry-run                    # plan, don't write

# Phase 3 — public-source ingestion
pnpm --filter @examready/web run web-ingest -- --source jamb --type syllabus
pnpm --filter @examready/web run web-ingest -- --source wikipedia --type universities
pnpm --filter @examready/web run web-ingest -- --source myschool --type cutoffs
```

All flags chain. All commands log to `editorial-results-<timestamp>.md`
in addition to console output (also gitignored).

---

## When past questions arrive

See [WHEN_PAST_QUESTIONS_ARRIVE.md](WHEN_PAST_QUESTIONS_ARRIVE.md) for the
specific runbook the user follows the day a JAMB / WAEC / NECO past-paper
PDF lands in `materials/`.

---

## Conventions

- **Never commit `materials/`.** It contains source files (often
  copyrighted past papers) that must stay local.
- **Every AI-generated row carries provenance.** A reviewer must always
  be able to answer "where did this come from?". The `editorial_audit_log`
  table is the canonical record.
- **Skip rather than fake.** If extraction fails on a particular file,
  document the failure in `editorial-results-*.md` rather than producing
  fabricated rows.
- **Cache aggressively.** Web scrapers, DeepSeek classifications, and
  reference content all cache so re-runs cost ~zero.
- **Audit prompts are version-pinned.** Updating an audit prompt requires
  re-running the audit pass on previously-stored items so confidence
  scores stay comparable across the dataset.
