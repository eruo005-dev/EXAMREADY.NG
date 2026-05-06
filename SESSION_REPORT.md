# Session Report — Sprint 3 (AI features + content import)

**Session date:** 2026-05-06
**Sprint 3 commit:** `98edaf8`
**Branch:** main, will push at end of report
**Predecessor:** prior session report covered Sprint 1 + Sprint 2; that content moved into CHANGELOG.md and is preserved in commit history at `fe140a6`.

## Sprint 3 — completed (4/4 in scope)

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `POST /api/ai/tutor/chat` streaming | ✅ | Multi-turn chat against Claude Sonnet 4.6, raw text/plain streaming (not SSE — simpler for plain prose generation), prepends synthetic context turn from question + last 3 wrong attempts when `questionId` provided. Daily cap 5/50/∞ (free/basic/pro). System prompt forbids markdown + sycophantic openers, names MANI helpline (+234 809 210 6493) for distress cases. |
| 2 | `POST /api/ai/explain-differently` | ✅ | Three levels: simpler / with-analogy / in-pidgin. Pidgin prompt is the moat — explicitly forbids Jamaican Patois + Yoruba/Igbo/Hausa, lists authentic Nigerian Pidgin markers (`make we`, `una`, `the answer na`, `wahala`, `fit`), preserves technical terms in English so students recognise them on the exam paper. With-analogy prompt requires Nigerian everyday analogies (akara, danfo, jollof). Haiku 4.5 for cost. Daily cap 10/100/∞. |
| 3 | `POST /api/ai/study-plan` | ✅ | Structured tool_use output mirrored as Zod schema for parse-safe validation. Computes the user's weak topics from the dashboard heatmap query (last-30-day attempt accuracy), feeds them in. Saves to new `study_plans` table — marks prior current=false, inserts new current=true in a transaction. Plus `GET /api/ai/study-plan` returns the user's current plan. Daily cap 1/5/∞. |
| 4 | Admin: generate-with-AI + moderation queue | ✅ | `POST /api/admin/questions/generate-with-ai` produces a batch via tool_use, inserts as `is_active=false` + `generated_by_model=<model>`. `GET /api/admin/questions/queue` lists pending. `POST /api/admin/questions/:id/reject` hard-deletes (soft-delete would leave the row stuck in the queue). Admin UI at `/admin/questions/generate` (cascading exam→subject→topic + count + difficulty hint) and `/admin/questions/ai-queue` (approve/edit/reject per question). Sidebar nav has both pages indented under Questions. |
| - | AI essay grader | ⏳ Skipped per user direction | Not in scope for this sprint per Sprint 3 prompt. Schema + rate-limit pattern from #1–#3 transfer cleanly when it lands. |

## Architectural decisions made this session

**Per-feature model selection is explicit, not abstracted.** `lib/ai/client.ts` exports an `AI_MODELS` const where each feature names its own model. Sonnet 4.6 vs Haiku 4.5 is a cost/quality tradeoff that should be visible at call site — not buried in a "default model" config that becomes a source of mystery cost overruns. Haiku 4.5 is ~3× cheaper than Sonnet 4.6, so explain-differently (short, fast, single-shot, called by free-tier users) gets Haiku; tutor chat (multi-turn reasoning) gets Sonnet.

**Streaming uses raw text/plain, not SSE.** The chat endpoint returns a `ReadableStream` over plain UTF-8 chunks. SSE adds parsing complexity (event names, retry intervals, structured error codes) that doesn't pay back for our simple prose-completion case. The frontend can append chunks directly to a buffer; on error it sees the connection close abruptly and shows a "try again" message. Switching to SSE later is straightforward if we add multi-stream UX features (thinking indicators, tool-use animations).

**Two-layer quota enforcement.** The `lib/ai/quota.ts` module separates throughput (Redis sliding window — burst protection, 5/10s) from daily caps (DB count over `ai_usage_log` — durable, tier-aware). Throughput runs first as a cheap gate; the DB count is the authoritative limit. Means Redis can drop a request budget on restart without resetting users' daily quota — important because the daily cap is the user-facing contract on the pricing page.

**Tool_use for structured output, not free-form JSON-in-text.** `study-plan` and `generate-with-ai` both use Anthropic's `tool_choice: { type: 'tool', name: '...' }` to force structured output. The same JSON schema is duplicated as both the tool's `input_schema` (sent to Claude) and a Zod schema (for validation). Costs us a small amount of duplication but avoids two failure modes: (1) markdown fences around JSON, (2) prose preamble before the JSON. We Zod-validate every tool output before persisting.

**Tutor context as a synthetic first user turn, not in the system prompt.** The system prompt is meant to be cacheable across users (per Anthropic's prompt-caching pricing). Per-user context (current question, recent mistakes) goes in the first user-turn message. Keeps the cache hit rate high even when each conversation has different context.

**AI usage telemetry stores counts, not content.** `ai_usage_log` records `(user_id, feature, model, input_tokens, output_tokens, duration_ms, succeeded)` per call. We never store the prompt or completion body. Two reasons: (1) PII risk — students may type their phone number into the chat — and (2) the signal we need is "how many calls" and "what's the cost", not "what was said". If a regression investigation later needs the conversation, read it from PostHog (which captures sanitized chat events) or replay from logs.

**AI-rejected questions are hard-deleted, not soft-deleted.** The moderation queue query filters on `is_active=false AND generated_by_model IS NOT NULL`. Soft-delete via PATCH would leave rejected questions in the queue forever. The new `POST /api/admin/questions/:id/reject` endpoint hard-deletes — but defensively refuses if any `attempt_answers` already reference the row.

## Addressing the 5 open questions from the prior report

> **1. Real Termii / Supabase / Paystack accounts — provider walkthrough scripts?**

I won't write walkthrough "scripts" — they go stale fast and provider UIs change quarterly. Instead, the README's "Third-party integrations" section already has the relevant signup steps per provider. What's actually useful is a **production-readiness checklist** I can add as a separate file. **Recommend:** add `LAUNCH_CHECKLIST.md` in a future session listing the exact env-var fills + dashboard configurations needed before going live, formatted so you tick boxes. Not done this session.

> **2. Founder bio in /about — replace placeholder.**

Still a placeholder. The paragraph from Sprint 1 is realistic-but-fictional (the "scored 198, then 287" story). Needs your actual story before launch — I can't supply it. Marked PLACEHOLDER in the source comment so it's findable via grep.

> **3. WhatsApp Business number in /contact — placeholder.**

Still `+2348012345678` in `apps/web/app/(marketing)/contact/page.tsx`. Replace once your Termii Business account is verified and you have the real number. Single line change.

> **4. AdSense ad unit IDs — empty until approval.**

Per-placement env vars (`NEXT_PUBLIC_ADSENSE_SLOT_*`) are documented in `.env.example` and read by `AdSlot` placement-by-placement. Until AdSense approves your application + you create the ad units in their dashboard, leave them empty — `AdSlot` returns null when slot ID is missing, so nothing breaks. The kill switch in `/admin/ads-toggle` is a separate gate (admin-controllable without a redeploy).

> **5. Sprint 2 deferred — commission an SME for question content?**

This is the single most-leveraged decision left. **My read remains:** commission, don't write yourself. The platform now has TWO paths to ingest content:

  - Path A: human SME writes via the CSV import (`/api/admin/questions/import` → `CSV_FORMAT.md`). Predictable cost, predictable quality.
  - Path B (NEW this sprint): admin uses `/admin/questions/generate` to draft a batch via Claude, then reviews each in `/admin/questions/ai-queue` before approving. Faster volume, but requires human review on every question (Sprint 3's deliberate guardrail — generated questions never go live without a human approval click).

A practical approach: use Path B for first-draft volume, Path A for licensed real past papers, and have an SME review the AI-generated batches at ~30 questions/hour (~₦500 per question reviewed beats ₦1,500 per question authored from scratch).

## Build state

- `pnpm install` — green (~16s, +1 dep: @anthropic-ai/sdk@0.30.1)
- `pnpm db:generate` — green; new migration `0005_cheerful_cardiac.sql` covers all three schema changes
- `pnpm typecheck` — green across all 6 packages
- `pnpm lint` — green across all 6 packages
- `pnpm build` — not re-run this session; Sprint 3 changes are typecheck+lint clean so no expected regressions, but recommend running before next deploy

## Test snapshot

| Scope | New tests this sprint | Status |
|---|---|---|
| `apps/web/lib/ai/__tests__/prompts.test.ts` | 15 prompt-construction tests | All passing locally |
| `apps/web/lib/ai/__tests__/explain-differently.integration.test.ts` | 15 integration tests (5 questions × 3 levels) | Skip without `ANTHROPIC_API_KEY`; not run this session |
| **Total Sprint 3** | **30** | |
| **Cumulative across Sprints 1–3** | **65** | (35 prior + 30 new) |

Prompt tests run on every CI build (no API key needed). Integration tests run on demand:
```
ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @examready/web test
```

Integration test cost ~$0.015 per full run (15 calls × Haiku 4.5 pricing). Designed for human-in-the-loop quality verification, not regression prevention — assertions check structural shape (no markdown, Pidgin markers present, no sycophantic opener) but deliberately don't snapshot model wording, since model output varies.

## Files added/changed

```
apps/web/
  app/api/ai/explain-differently/route.ts                      (new)
  app/api/ai/tutor/chat/route.ts                                (new — raw streaming Response)
  app/api/ai/study-plan/route.ts                                (new — POST + GET)
  app/api/admin/questions/generate-with-ai/route.ts             (new)
  app/api/admin/questions/queue/route.ts                        (new)
  app/api/admin/questions/[questionId]/reject/route.ts          (new)
  lib/ai/client.ts                                              (new — Anthropic wrapper, telemetry)
  lib/ai/quota.ts                                               (new — two-layer enforcement)
  lib/ai/prompts/                                               (new — 4 prompt files)
  lib/ai/__tests__/prompts.test.ts                              (new — 15 tests)
  lib/ai/__tests__/explain-differently.integration.test.ts      (new — 15 tests, key-gated)
  package.json                                                  (+ @anthropic-ai/sdk)

apps/admin/
  app/(admin)/questions/generate/page.tsx                       (new — generation trigger UI)
  app/(admin)/questions/ai-queue/page.tsx                       (new — moderation queue UI)
  app/(admin)/layout.tsx                                        (added 2 nav links)

packages/db/
  src/schema/study-plans.ts                                     (new — study_plans + ai_usage_log)
  src/schema/index.ts                                           (re-export)
  src/schema/questions.ts                                       (+ generated_by_model column + partial index)
  migrations/0005_cheerful_cardiac.sql                          (new)

packages/shared/
  src/schemas/ai.ts                                             (new — Zod schemas for AI endpoint inputs)
  src/schemas/index.ts                                          (re-export)
```

Total: 20 new files, 6 modified files, 1 new migration. **5,844 insertions in commit `98edaf8`**.

## What I deliberately did not do this session

- **No fake API key.** Integration tests skip when `ANTHROPIC_API_KEY` is unset rather than mock the Anthropic SDK. Mocking would produce false confidence — the real risk in AI features is what the model actually says, not whether the SDK was called.
- **No "thinking..." spinner UI before the streaming response is wired.** The endpoint exists; a chat-bubble UI component reading the ReadableStream is ~50 lines of frontend that I'll add only after the integration tests have been run by a human and the prompts tuned.
- **No frontend buttons for explain-differently.** Same logic — endpoint first, UI when the prompt has been quality-reviewed against real questions.
- **No essay grader.** Explicitly out of scope per your Sprint 3 directive ("Skip the AI essay grader for now — needs more careful rubric design"). Agreed.
- **No content backfill via the new AI generation pipeline.** That's the natural follow-up but it's Sprint 4 territory (and partly editorial — needs an SME reviewing batches).

## Open questions for you when you return

1. **`ANTHROPIC_API_KEY` in Vercel staging.** Set it before testing AI features end-to-end. Until set, all four endpoints return `503 BAD_GATEWAY` with the message "AI features are not configured on this deployment." That's the right behaviour for a gracefully-degraded missing-key state.

2. **Daily-cap thresholds.** I picked free=5/10/1 (tutor/explain/plan) and basic=50/100/5 based on your Sprint 3 prompt and reasonable defaults. Once you have real usage data, revisit. Constants are in `apps/web/lib/ai/quota.ts` `DAILY_CAPS`.

3. **Pidgin prompt verification.** The 15 integration tests assert structural Pidgin markers, but the real quality check is reading 10 generated explanations and judging whether they sound like a Nigerian student would actually understand them. **Recommend:** when you set the API key, run the integration tests and read the Pidgin outputs. If anything sounds off (Yoruba slipping in, register too formal/informal, technical terms wrongly translated), the system prompt at `apps/web/lib/ai/prompts/explain-differently.ts` is where to tune.

4. **Tutor context — should it include the user's STRENGTHS too?** Right now `buildTutorContextMessage` only injects recent mistakes. There's a case for also injecting "strong topics" so the tutor knows what they don't need to re-explain. Left it out for sprint scope but worth ~15 minutes when the feature ships and we see how students actually use the chat.

5. **Generated-question review burden.** At 10 questions per generation × the 1,800-question target from Sprint 2, that's 180 generations and 180 review sessions. Even at 30 questions/hour reviewed, that's 60 hours of admin time. **Recommend:** track approval rate per generation batch; if it's >85%, consider auto-approving easier difficulty ranges and routing only difficulty 4–5 + comprehension types to human review. Don't ship that until you have the data to justify it.

## Recommended next steps when you return

1. **Set `ANTHROPIC_API_KEY` in Vercel staging.** Run the integration tests once. Read the 5 Pidgin outputs by hand. Adjust the prompt if any sound off.

2. **Generate 50 questions on JAMB Mathematics → Algebra topic via the admin UI.** Review them in the moderation queue. The cheapest end-to-end test of the AI generation pipeline AND gives us the first real signal on quality.

3. **Wire the explain-differently button into the results page.** The API endpoint exists but no UI surfaces it. Adding an "Explain differently" dropdown next to each wrong-answer breakdown is ~30 lines of frontend.

4. **Wire the tutor chat into a /tutor page or modal.** Same — endpoint exists, UI doesn't. The streaming text endpoint just needs a chat-bubble UI component reading the ReadableStream with `response.body.getReader()`.

5. **Decide on the question-content commission.** Sprints 1, 2, and 3 have all flagged this as the gating risk; Sprint 3 ADDS the AI generation pipeline as a partial mitigation, but human SME review is still the bottleneck. Until you decide who's reviewing and at what rate, content is the slowest-moving variable.

I'll be here when you're back.
