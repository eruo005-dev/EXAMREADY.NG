# When Past Questions Arrive — Runbook

The day a JAMB / WAEC / NECO past-paper PDF lands in your inbox, follow
this checklist top-to-bottom. The editorial factory (Sprint 7) does most
of the work; your job is mostly to point it at the right files and
review the output.

> If anything in this runbook is out of date, treat
> [EDITORIAL_FACTORY_README.md](EDITORIAL_FACTORY_README.md) as
> authoritative — that's the technical spec the CLI is built against.

---

## 1. Drop the file in the right place (1 min)

Move each PDF / DOCX into `materials/` using the **exact** path
convention so the heuristic classifier picks the strongest signals:

```
materials/
  jamb-utme/
    2022/
      mathematics.pdf
      english-language.pdf
      biology.pdf
  waec-ssce/
    2023/
      may-june/
        mathematics.pdf
        english-language.pdf
  neco-ssce/
    2023/
      mathematics.pdf
```

Filename hints picked up by the classifier (Phase 1):

- `jamb` / `waec` / `neco` / `nabteb` / `gce` / `post-utme` → exam slug
- A 4-digit year (`2022`) anywhere in the path → year
- A subject keyword (`mathematics`, `biology`, `english`, `crk`, …) → subject slug

Naming the file `jamb-mathematics-2022.pdf` is enough; the deeper
folder structure above is optional but helps when you have many files.

> **Never `git add` materials/.** The folder is already in `.gitignore`.
> These PDFs are typically copyrighted and must stay local.

---

## 2. Re-run the inventory (~30s)

```bash
pnpm --filter @examready/web run inventory
# Or, for borderline files where the filename is ambiguous:
pnpm --filter @examready/web run inventory -- --use-ai
```

Open `materials-inventory.md` (also gitignored, regenerated each run).
Sanity-check the table:

- Every past-paper file shows `category=past-questions, pipeline=ingest-as-questions`.
- Confidence ≥ 70.
- Hints column shows `examSlug=jamb-utme, subjectSlug=mathematics, year=2022`.

If a file is mis-classified:

- Rename it for stronger signal, or
- Re-run with `--use-ai` so DeepSeek casts the deciding vote.

---

## 3. Run the editorial factory (variable — minutes to hours)

Pick the right scope for your batch.

### First time on a new exam (recommended: dry-run first)

```bash
pnpm --filter @examready/web run editorial-factory --pipeline questions --dry-run
```

Open `editorial-results-<timestamp>.md`. Confirm:

- The chunker found a sensible number of question-shaped blocks per file.
- No file is hitting `vision pipeline required` (means the PDF was
  scanned without OCR; route those to the vision queue separately).
- Estimated cost looks like ~$0.0010 × question count.

### Live run

```bash
pnpm --filter @examready/web run editorial-factory --pipeline questions
```

The factory runs the parser → enricher → audit pass per chunk and
writes:

- `questions` rows + `options` rows (target tables).
- One `editorial_audit_log` row per question with confidence + flags + cost.
- `extraction_jobs` + `ingestion_jobs` rows for resumability.

Interrupted? Re-run the same command — it picks up where it stopped.

---

## 4. Watch the queues at /admin/editorial (active monitoring)

Open `/admin/editorial` (admin auth required — you must be promoted via
`app_metadata.role = 'admin'` in Supabase). The page shows live
counters for each pipeline:

- **Auto-approved** (confidence ≥ 85, no critical flag): ready to ship.
  Reviewer skim only.
- **Needs review** (confidence 70-84): per-item decision queue.
  Use J/K/A/R/E shortcuts (consistent with the Sprint 5 question
  moderation queue) — typical throughput is ~60 items/hour.
- **Rejected by audit** (confidence < 70 OR critical flag): hidden by
  default. One-click restore + re-enrich gets the item back into the
  pipeline with a fresh enrichment pass.

Cost so far + projected total is at the top of the page. Sprint 7's
audit pass keeps cost-per-question at ~$0.0010 with prompt caching.

---

## 5. Review

For every batch:

1. Skim the auto-approved view. Look for outliers:
   - Stem with embedded option text ("which of the following: A) …")
   - Options that are obviously not 4-distractor MCQ
   - Explanations referencing a different correct answer than the marked one
     When you find one, click "Re-audit" to push it back into the queue.

2. Work through the `needs_review` queue with J/K/A/R/E.

3. Reject items that are unfixable. The audit log keeps the rejection
   reason — useful when you tweak prompts later.

---

## 6. Promote when ready

Once the target subject crosses the coverage threshold (200+ approved
questions, 80%+ of topics with at least one question), promote it from
`beta` to `live` in the admin catalog (or via SQL):

```sql
UPDATE exams SET coverage_status = 'live' WHERE slug = 'jamb-utme';
```

Sitemaps + landing-page exam lists pick this up on next build.

---

## 7. SEO unlock — past-paper public pages

Once questions are in the database, the past-paper public route
auto-publishes:

```
/past-papers/jamb-utme/2022/mathematics
/past-papers/waec-ssce/2023/biology
…
```

These pages are crawler-indexable and target high-volume long-tail
queries ("JAMB Mathematics 2022 past questions"). The auth gate kicks
in only when the user clicks "Start attempt". The URL pattern is the
biggest organic-traffic driver in the platform — every approved year
× subject pair becomes a page.

---

## Common edge cases

| Symptom                                                         | Cause                                                              | Fix                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Inventory says `vision pipeline required`                       | PDF is scanned (no embedded text)                                  | Phase 2 vision pipeline kicks in automatically when questions arrive — extracted via DeepSeek-vl2-chat fallback. |
| Audit confidence stuck at 60-70 for a whole subject             | Topic-id matching is failing — topics table empty for that subject | Run the syllabus scraper first (`pnpm web-ingest --source jamb --type syllabus`) to populate topics.             |
| `cost_usd` running far above $0.0010/Q                          | Prompt-cache miss on first 10 items per pipeline                   | Normal — caches warm up after the first batch. Watch the trailing average across a 100-Q run.                    |
| Item rejected with `answer_mismatch` but you can see it's right | Parser put the answer in the wrong field                           | Click "Edit", fix the marked-correct option, save. The audit re-runs automatically.                              |
| Two questions with identical stems                              | Source PDF had a duplicated page                                   | The questions pipeline dedupes by stem within the same topic (idempotent); duplicates won't insert.              |

---

## What not to do

- **Don't bypass audit** by editing the DB directly. Every reviewer
  override goes through the admin UI so the audit log captures the
  decision.
- **Don't merge multiple years** into one PDF before ingesting. Per-year
  separation is what makes the past-paper SEO page possible.
- **Don't run the factory against materials/ that contains files you
  haven't classified yet.** Run inventory first; the editorial factory
  trusts the classifier.
