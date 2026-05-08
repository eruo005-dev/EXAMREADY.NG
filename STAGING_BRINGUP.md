# Staging Deployment — Manual Test Plan

Use this AFTER `pnpm preflight` reports green and you've deployed to `staging.examready.ng` (or `examready-staging.vercel.app`). Each section is a top-to-bottom flow; don't skip steps.

---

## Pre-test setup (5 min)

- [ ] Open Sentry dashboard for the staging project in one tab
- [ ] Open PostHog dashboard for the staging project in another tab
- [ ] Open Vercel logs in a third tab (`vercel logs --follow` if you have the CLI, or the Logs tab in the dashboard)
- [ ] Have a real Nigerian SIM phone ready (preferably MTN — most reliable for OTP testing)
- [ ] If you don't have Termii sender approved yet (TERMII_FINISH.md), accept that OTPs will arrive from the default sender — flow still works

---

## Test 1: Signup → OTP → onboarding (10 min)

1. **Open** `https://staging.examready.ng/signup` on your phone
2. **Enter** your real Nigerian phone number in international format (+234...)
3. **Submit.** Expected: redirect to OTP entry page, "Code sent" toast
4. **Watch** Vercel logs for the request hitting `/api/webhooks/supabase/send-sms` and forwarding to Termii
5. **Receive** the 6-digit OTP via WhatsApp (or SMS fallback if WhatsApp denied)
   - **Target latency:** < 60 seconds end-to-end
   - **If > 60s:** check Termii dashboard for delivery status. Could be DLT issue or carrier latency.
6. **Enter** the OTP. Expected: redirect to onboarding flow
7. **Pick** a target exam (JAMB UTME), expected exam date, hours per week
8. **Submit onboarding.** Expected: redirect to `/dashboard`

**Sentry should show:** zero errors. PostHog should show: signup_started, signup_otp_sent, signup_otp_verified, onboarding_completed events.

---

## Test 2: 10-question practice attempt (10 min)

1. From `/dashboard`, click "Practice now"
2. Pick subject = Mathematics, mode = Quick Practice
3. Confirm question count = 10, hit Start
4. Answer all 10 questions (mix correct + intentional wrong answers — at least 3 wrong so the explanation surface is testable)
5. Submit. Expected: redirect to `/results/[attemptId]`
6. **Verify** the results page shows:
   - Score card with correct/total
   - Per-question breakdown
   - For each question: ExplanationCard with "Explain differently" dropdown
   - Topic badge per question
7. Click "Explain differently" on a wrong answer:
   - **Simpler English** — should generate ~4-6 sentences in plain prose
   - **With an analogy** — should reference Nigerian-context analogy (akara, danfo, jollof, etc.)
   - **Step-by-step** — should be 1-6 numbered steps, one sentence each
   - **In Pidgin** — option should NOT appear (PIDGIN_ENABLED defaults to false)
8. Click thumbs-up on one explanation. Expected: toast "Thanks for the feedback"

**Watch Vercel logs:** see `[ai/explain-differently]` calls hitting DeepSeek with provider=deepseek, success=true.

---

## Test 3: AI tutor streaming (5 min)

1. From a question's results card, click "Ask Ready AI" (or open `/tutor`)
2. Type a follow-up question: "Can you explain the difference of two squares?"
3. **Verify** streaming feels responsive — chunks appear incrementally, not as one big block at the end
4. Send 2 more messages
5. **Watch logs** for the 3 AI tutor chat events
6. Confirm `was_fallback: false` on all three (DeepSeek primary)

If chunks arrive in one big block instead of streaming smoothly, check that the response uses `text/plain` not `application/json` — that's the streaming mode.

---

## Test 4: AI Examiner (10 min) — Sprint 6 NEW

This requires a question with `question_type='theory'` AND a populated `marking_guide`. The seed data doesn't include any — you'll need to either:

- (a) Manually insert one via SQL on staging:
  ```sql
  INSERT INTO questions (exam_id, subject_id, topic_id, question_type, stem, difficulty, explanation, max_marks, marking_guide, is_active)
  VALUES (
    (SELECT id FROM exams WHERE slug = 'waec-ssce'),
    (SELECT id FROM subjects WHERE slug = 'english-language' LIMIT 1),
    (SELECT id FROM topics WHERE slug = 'essay-writing' LIMIT 1),
    'theory',
    'Write an article for publication in a national daily, discussing the effects of social media on Nigerian secondary-school students. Suggested length: 450 words.',
    3,
    'Use the marking guide as your scaffold; aim for a clear thesis, three body paragraphs, conclusion. The marking guide here weights structure, content depth, and language use.',
    20,
    '[{"point":"Clear introduction with thesis statement","marks":3},{"point":"At least three distinct effects discussed with examples","marks":8},{"point":"Coherent paragraphs with topic sentences","marks":4},{"point":"Conclusion that synthesises (not just summarises)","marks":3},{"point":"Standard register, grammar, mechanics","marks":2}]'::jsonb,
    true
  );
  ```
- (b) Or wait until your content reviewer adds theory questions to the moderation queue.

Once you have one:

1. Open the practice page for that question
2. Type a 200-word answer in the response box
3. Click "Submit & Grade"
4. **Verify** the response (within ~15s):
   - Total marks awarded with progress bar
   - Per-criterion breakdown — 5 rows for the seeded question, each with awarded/max marks + feedback
   - 1-paragraph overall feedback in Nigerian English register
   - Exactly 3 suggested improvements (each one short imperative sentence)
5. **Watch logs** for `[ai/grade-theory]` hitting DeepSeek-R1 (reasoner)
6. **Verify** the grading is recorded in `theory_attempts` table:
   ```sql
   SELECT id, total_marks, max_marks, provider, model FROM theory_attempts ORDER BY created_at DESC LIMIT 1;
   ```

---

## Test 5: Predicted Score (5 min) — Sprint 6 NEW

Requires the user to have answered ≥ 50 questions on the same exam.

1. From dashboard or settings, hit `/api/me/predicted-score?examId=<jamb-uuid>`
2. **For a new user (< 50 answers):** expect 400 with `INSUFFICIENT_DATA`. UI should render "Take 50+ questions to unlock predicted score" CTA.
3. **For a populated test user:** seed 60 attempts via the practice flow, then re-hit the endpoint. Expect:
   - `band` object with label (e.g. "260-290" for JAMB)
   - `weightedAccuracy` integer
   - `trend` of "improving" / "plateauing" / "declining"
   - `subjects` sorted weakest-first
   - `interpretation` — one paragraph from DeepSeek (or null if AI was unavailable; data still works)

---

## Test 6: Daily reminder cron (15 min)

1. **Check** `vercel.json` shows the daily-reminders cron schedule
2. **Manually trigger** via curl with the cron secret:
   ```bash
   curl -X POST https://staging.examready.ng/api/cron/daily-reminders \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
3. **Expected:** 200 OK + count of users notified in response
4. **Verify** the test user (you) gets a WhatsApp from EXAMREADY — "Don't break your streak today, X" or similar
5. **Check** `notification_log` table — there should be a row with `templateKey='daily_reminder'`, `status='sent'`

If you set `CRON_SECRET` wrong, expect 401. If Termii is misconfigured, the row will say `status='failed'` with the error message.

---

## Test 7: Admin actions (10 min)

1. Log into `https://staging.examready.ng/admin` (this is the admin app — separate Vercel project, separate deploy)
2. **Verify** you can see the dashboard. If you get "Admin access required":
   - You haven't promoted yourself. Use the SQL/RPC from LAUNCH_CHECKLIST.md §1 to set `app_metadata.role = 'admin'` on your user
3. **Visit** `/admin/questions/ai-queue`
4. If empty, run a quick generate batch:
   - Visit `/admin/questions/generate` (NOT bulk-generate yet — start small)
   - Pick JAMB → Mathematics → Algebra → 5 questions → mixed difficulty
   - Submit
   - Wait ~10s, refresh `/admin/questions/ai-queue`
   - Should see 5 new pending questions
5. **Test J/K/A/R/E shortcuts:**
   - J / K to navigate
   - A to approve one
   - **Verify** the approved question now has `approved_by` and `approved_at` set
6. **Try bulk-generate** (Sprint 6):
   - Visit `/admin/questions/bulk-generate`
   - Pick WAEC → Mathematics → 15/topic, easy=5, medium=7, hard=3
   - Submit
   - Visit `/admin/bulk-generation-jobs` — verify the job appears with status 'running'
   - Wait 5 min, refresh — verify status moves to 'completed' once all topic workers finish

---

## Test 8: AI quality review (5 min)

1. Set `AI_LOG_SAMPLES=true` in Vercel staging env
2. Re-deploy (the env change requires it)
3. Run 3-5 explain calls from the practice flow
4. Visit `/admin/ai-quality-review`
5. **Verify:**
   - Per-feature summary cards showing call volume + thumbs ratio
   - Recent samples panel with provider/model badges + redacted output
6. Set `AI_LOG_SAMPLES=false` and re-deploy. Future calls won't be sampled (existing samples remain visible).

---

## Sprint 7 additions — editorial factory + CBT engine

The Sprint 7 factory + CBT engine ship in scaffold form. Stage these checks once the staging Supabase is live:

### Editorial factory smoke test (10 min)

```bash
# 1. Inventory whatever is in materials/
pnpm --filter @examready/web run inventory
# Verify materials-inventory.md is generated and looks sensible.

# 2. Dry-run the factory
pnpm --filter @examready/web run editorial-factory --dry-run --max 3

# 3. Live run on a single pipeline
pnpm --filter @examready/web run editorial-factory --pipeline syllabus
# Today this returns 0 rows by design (parser prompts deferred until
# real source data arrives) — confirm the report shows the scaffold
# notes, not crashes.
```

Open `/admin/editorial` in the browser. The page should render the six pipeline cards + audit-verdict legend. Trigger buttons are disabled pending the Phase-7 follow-up `/api/admin/editorial/run` endpoint.

### Web scraper smoke test (5 min)

```bash
pnpm --filter @examready/web run web-ingest --source wikipedia --type universities --dry-run
```

Expected: fetches https://en.wikipedia.org/wiki/List_of_universities_in_Nigeria, populates `scraping_cache` on first hit, logs the count of detected institution-shaped rows. Re-run to confirm cache HIT. Other sources (jamb/waec/neco/nuc/myschool) return scaffold notes — not failures.

### CBT engine smoke test (15 min)

1. Sign in as a test user; start a practice mock from `/dashboard` (any subject, ≥10 questions).
2. After creation, navigate to `/cbt/<attemptId>` (the URL Path is full-screen by design — no app shell).
3. Verify the JAMB-fidelity layout: top bar (candidate / subject / timer / Q counter), main panel (passage if any + stem + 4 options), right palette grid, bottom action bar.
4. Keyboard test (NON-NEGOTIABLE):
   - `A` / `B` / `C` / `D` pick option, persists across refresh.
   - `P` / `N` navigate. `R` clears the current selection.
   - `F` flags current question (palette goes yellow).
   - `K` toggles the calculator (verify drag, sqrt, %, memory all work; Esc closes).
   - `S` opens the submit-confirmation modal; pressing Submit redirects to `/results/<attemptId>`.
5. Timer pulse states: set a 5-minute attempt and watch the timer go amber at 5:00 then red-pulsing at 1:00 then auto-submit at 0:00.
6. Open `/cbt/keyboard-help` and confirm the cheat sheet renders.

Mobile (Phase 4.8 deferred): current layout is desktop-first. The palette + calculator panels can render on a phone but bottom-sheet treatment is a follow-up. Don't gate launch on mobile-CBT polish; a tablet works today.

---

## Common failure modes + remediation

| Symptom                                                       | Likely cause                                          | Fix                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| OTP doesn't arrive within 5 minutes                           | Termii sender ID not approved                         | See TERMII_FINISH.md                                                           |
| 401 on /api/admin/\*                                          | User isn't admin                                      | Promote via app_metadata, NOT user_metadata                                    |
| 503 on /api/ai/\*                                             | DEEPSEEK_API_KEY unset or DeepSeek down               | Run preflight; check api.deepseek.com status                                   |
| Fallback fires (was_fallback=true) on every call              | DeepSeek 4xx (likely auth or model not enabled)       | Verify key + check DeepSeek model allowlist                                    |
| Streaming chat blocks at the end instead of incremental       | Edge runtime caching                                  | Confirm route has `export const dynamic = 'force-dynamic'` and no `revalidate` |
| Pidgin option visible in UI                                   | NEXT_PUBLIC_PIDGIN_ENABLED accidentally set to 'true' | Set to 'false' or unset                                                        |
| Predicted Score returns INSUFFICIENT_DATA after 60+ questions | Questions counted are NOT on the same examId          | Check `attempts.exam_id` matches the predicted-score query                     |

---

## What to do AFTER all tests pass

1. Mark the relevant items in LAUNCH_CHECKLIST.md as ✅
2. Capture the staging URL in your team's chat
3. **Do NOT** announce publicly — staging is for internal verification only
4. Plan a small private-beta cohort (5-10 students you know) and send them the staging URL with a short welcome message
5. Watch Sentry + PostHog for the first 48 hours. Anything unusual goes in PRODUCTION_BUGS.md.
6. Once 48h are clean, plan the production deploy + announcement.
