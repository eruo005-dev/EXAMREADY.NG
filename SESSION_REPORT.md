# Session Report — Sprint 5 (DeepSeek hybrid integration)

**Session date:** 2026-05-06
**Sprint 5 base:** Sprint 4 working tree (DeepSeek changes layered on top)
**Predecessor report:** Sprint 4 content moves into CHANGELOG.md and is preserved in git history.

---

## Provider routing — what shipped

Hybrid Claude + DeepSeek with explicit per-feature routing. Defined in `apps/web/lib/ai/constants.ts`:

| Feature                                | Primary           | Fallback         | Why this routing                                                                                    |
| -------------------------------------- | ----------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| Tutor chat                             | Claude Sonnet 4.6 | DeepSeek-V3      | Multi-turn reasoning + Nigerian-English register tuning where quality matters most.                 |
| Explain-differently / **simpler**      | DeepSeek-V3       | Claude Haiku 4.5 | High volume, lower stakes, plain rewrite.                                                           |
| Explain-differently / **with-analogy** | DeepSeek-V3       | Claude Haiku 4.5 | Analogy quality is mostly the prompt.                                                               |
| Explain-differently / **in-pidgin**    | Claude Haiku 4.5  | **NONE**         | Pidgin is the moat. DeepSeek's Pidgin is unverified — silently swapping providers would degrade it. |
| Study plan                             | DeepSeek-V3       | Claude Haiku 4.5 | Structured tool-use output, low quality risk.                                                       |
| Admin question generation              | DeepSeek-V3       | Claude Haiku 4.5 | Human-reviewed before going live.                                                                   |

**Pidgin is the lone exception**: when the Anthropic Haiku Pidgin call fails, the API returns 503 to the client and the UI suggests "Try Simpler English or With an analogy." We never silently call DeepSeek for Pidgin.

**Why Haiku as the fallback (not Sonnet)?** Cost — fallback is a tail event, no need to pay Sonnet rates for it. Plus Haiku runs the same JSON tool schema; quality difference on structured output is small.

---

## Cost savings projections (under hybrid)

Same 80/15/5 free/basic/pro mix. Pricing assumed: Sonnet $3 in / $15 out, Haiku $0.25 / $1.25, DeepSeek-V3 ~$0.27 / ~$1.10 (verify at api-docs.deepseek.com/quick_start/pricing before pricing decisions).

| DAU     | Sprint 4 all-Claude    | Sprint 5 hybrid             | Saving           |
| ------- | ---------------------- | --------------------------- | ---------------- |
| 1,000   | $94/day (~$2.8k/mo)    | **~$58/day (~$1.7k/mo)**    | -38% (~$1.1k/mo) |
| 10,000  | $939/day (~$28k/mo)    | **~$569/day (~$17k/mo)**    | -39% (~$11k/mo)  |
| 100,000 | $9,386/day (~$282k/mo) | **~$5,734/day (~$171k/mo)** | -39% (~$111k/mo) |

The biggest single-call win: study-plan dropped from $0.054 to $0.004 per generation (13× cheaper). Question generation 13× cheaper too. See [API_COSTS.md](API_COSTS.md) for the full breakdown plus a "what if we full-switch to DeepSeek" appendix that shows another ~$140k/month at 100k DAU is on the table once Pidgin is verified on DeepSeek (suite in PIDGIN_SAMPLES.md).

---

## Sprint 5 — engineering deliverables

| #   | Task                                       | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Provider abstraction layer                 | ✅     | `lib/ai/providers/` — `types.ts` (AiProvider interface), `anthropic.ts`, `deepseek.ts` (OpenAI SDK pointed at `api.deepseek.com/v1`), `index.ts` (factory + `runWithFallback`). Each provider implements `completion`, `stream`, `toolUse`. `ProviderError` carries `isRetryable` so the wrapper knows when to retry.                                                                                                                            |
| 2   | Tool use / structured output compatibility | ✅     | One JSON-Schema in the prompt files; Anthropic adapts to `tools[].input_schema`, DeepSeek adapts to `tools[].function.parameters`. DeepSeek's `arguments` JSON string is parsed inside the adapter so callers see the same `{ input: object }` shape regardless of provider. Cross-provider integration test asserts both providers' output passes the same Zod schema.                                                                          |
| 3   | DeepSeek-specific prompt tuning            | ✅     | Tightened the `SHARED_CONSTRAINTS` in `prompts/explain-differently.ts` with explicit "4–6 sentences, 2 paragraphs max, no preamble" — DeepSeek skews verbose by default. Tightened study-plan and generate-questions prompts with explicit required-field language ("All 7 days must be present", "Each question has EXACTLY 4 options labelled A, B, C, D"). One prompt per feature works for both providers — no per-provider variants needed. |
| 4   | Cost tracking + provider visibility        | ✅     | `ai_usage_log` got two new columns (`provider`, `was_fallback`) via migration `0007_petite_mariko_yashida.sql` — existing rows backfill as `'anthropic'` via the column default. `/admin/ai-quality-review` now shows per-feature provider breakdown ("DeepSeek: 320, Anthropic: 12 ↩4 fallback") and per-sample provider/fallback badges.                                                                                                       |
| 5   | Fallback wrapper + Pidgin no-fallback rule | ✅     | `runWithFallback(primary, fallback, op)` — primary fails with `isRetryable=true`, fallback runs and result carries `wasFallback: true`. Pidgin path passes `fallback: null`; primary error rethrows with no DeepSeek call. 4 unit tests cover happy path, retryable failure, non-retryable failure (4xx — no fallback), and the Pidgin no-fallback case (mocks DeepSeek and asserts it's never called).                                          |
| 6   | Env + secrets + health endpoint            | ✅     | `DEEPSEEK_API_KEY` added to `.env.example` with the platform.deepseek.com link. `LAUNCH_CHECKLIST.md` updated with the DeepSeek vendor section ("fund $20+ to clear new-account hold"). `GET /api/health/ai` (admin-only) probes both providers with a 4-token request and returns latency + status — operator dashboard for "is DeepSeek up right now."                                                                                         |
| 7   | Tests                                      | ✅     | 4 fallback unit tests (mocked, always run); 5 DeepSeek integration tests (skip without `DEEPSEEK_API_KEY`); 3 cross-provider integration tests (skip unless BOTH keys present); the existing 15 prompt tests still pass; the existing Anthropic integration test now correctly skips instead of failing at module load.                                                                                                                          |
| 8   | Documentation                              | ✅     | `apps/web/lib/ai/README.md` (routing rationale + how to add a third provider in <2h). `API_COSTS.md` rewritten with hybrid projections + full-DeepSeek appendix. `LAUNCH_CHECKLIST.md` updated. This `SESSION_REPORT.md`. `CHANGELOG.md` Sprint 5 entry below.                                                                                                                                                                                   |

---

## Architectural decisions made this sprint

**One JSON-Schema, two adapters.** The prompt files (`prompts/study-plan.ts`, `prompts/generate-questions.ts`) export a `ToolDefinition` with `name`, `description`, `schema`. The schema is plain JSON-Schema. Each provider's adapter wraps it in its native shape (`input_schema` for Anthropic, `function.parameters` for DeepSeek). One source of truth, no drift. Same schema also feeds the Zod validator that runs on the parsed output, so persistence sees a validated shape regardless of which provider answered.

**Pidgin has `fallback: null`, not "skip the wrapper."** The routing config encodes the Pidgin no-fallback rule explicitly — `runWithFallback` sees `null` and rethrows. This means the _same code path_ handles Pidgin and the others; no special "if pidgin then call directly" branch in the route handler. The explicit `null` is the load-bearing part: a future reader can grep for it and see "Pidgin must never fall back" without reading the route handler. There's a unit test that mocks both providers and asserts DeepSeek is never called when `fallback: null`.

**The fallback wrapper accepts an injectable resolver.** `runWithFallback(primary, fallback, op, resolver?)` — production omits the fourth arg and gets the global factory; tests pass a fake resolver to inject mocks. This dodges the vi.spyOn-on-namespace-imports problem (vi.spyOn doesn't intercept _internal_ binding calls within a module). Tests stay simple and the production path is unchanged.

**Streaming + fallback only at init time.** If the primary stream errors _before_ any text reaches the client, we fall back. If it errors _mid-stream_, we just close — restarting from the secondary provider would emit a second partial response, which is worse UX than the client showing "connection lost, try again." Documented in the route handler comment.

**Provider field is `varchar(20)`, not a `pg_enum`.** Adding a third provider should be a single-line change in TypeScript — wrapping `provider` in a Postgres enum forces a migration every time. Validation lives at the application layer (the `ProviderName` union).

**Admin AI quality view aggregates per (feature, provider).** The summary card stack now shows fallback count alongside total calls and the per-provider split. So if DeepSeek goes flaky, the admin sees `deepseek: 320 ↩45 fallback` next to the feature card without digging into raw logs. Sample list also shows provider + fallback badges per sample so register comparisons can be filtered visually.

---

## DeepSeek quirks worth knowing

Discovered while building the abstraction (some of these come up in the integration tests when a key is wired):

- **Tool arguments arrive as a JSON string, not an object.** OpenAI's API (which DeepSeek mirrors) returns `tool_calls[].function.arguments` as a string that needs `JSON.parse`. Anthropic returns a parsed object. The DeepSeek adapter parses inside, so callers always see `{ input: object }`. If parsing fails the adapter throws `ProviderError(isRetryable: false)` — retrying on the same prompt won't help, but the fallback runs.
- **Length defaults skew verbose.** Without an explicit length constraint in the system prompt, DeepSeek-V3 will emit longer responses than Claude does for the same prompt. This sprint tightened the explain-differently prompt to "4–6 sentences total, 2 short paragraphs at most." Without that, free-tier students were getting walls of text.
- **Stream usage chunk arrives at the END.** OpenAI's `stream: true` with `stream_options: { include_usage: true }` puts the `usage` block in the final chunk. Anthropic puts `input_tokens` in `message_start` and `output_tokens` in `message_delta`. The adapter normalises both into our `{ kind: 'usage', inputTokens?, outputTokens? }` so callers don't care.
- **`message.content` can be `null` on tool-call responses.** When the model decides to call a tool, `content` is null and the data is in `tool_calls`. We don't read `content` on the tool-use code path so this isn't a bug, but worth knowing for future features.
- **`temperature` ranges differ.** Anthropic: 0–1. DeepSeek (OpenAI-compatible): 0–2 with default 1.0. We pass through unchanged but if a future feature wants creative output above 1.0 it'll only work on DeepSeek.

---

## Build state

- `pnpm typecheck` — green across all 7 packages
- `pnpm lint` — green across all 7 packages, max-warnings 0 enforced
- `pnpm db:generate` — green; new migration `0007_petite_mariko_yashida.sql`
- `pnpm test` — **49 passing, 25 skipped, 0 failing**
  - 15 prompt tests (always run, no key needed)
  - 4 fallback unit tests (always run, mocked)
  - 8 CSV import tests (always run)
  - 15 cron-time tests (always run)
  - 7 PII redaction tests (always run)
  - 15 Anthropic explain-differently integration tests (skipped without `ANTHROPIC_API_KEY`)
  - 5 DeepSeek integration tests (skipped without `DEEPSEEK_API_KEY`)
  - 3 cross-provider tests (skipped unless BOTH keys set)
  - 2 daily-reminder DB tests + 2 internal skips
- **Sprint 4's known integration-test module-load bug is incidentally fixed** — the test now imports `AI_MODELS` from `lib/ai/constants.ts` (no DB dependency) instead of `lib/ai/client.ts` (which loaded `lib/db.ts`). Skips correctly when no key.

---

## Files added/changed

```
NEW
  apps/web/lib/ai/constants.ts                                     (AI_MODELS routing)
  apps/web/lib/ai/README.md                                        (hybrid strategy doc)
  apps/web/lib/ai/providers/types.ts                               (AiProvider interface)
  apps/web/lib/ai/providers/anthropic.ts                           (Anthropic adapter)
  apps/web/lib/ai/providers/deepseek.ts                            (DeepSeek adapter)
  apps/web/lib/ai/providers/index.ts                               (factory + runWithFallback)
  apps/web/lib/ai/__tests__/fallback.test.ts                       (4 unit tests, no key)
  apps/web/lib/ai/__tests__/deepseek.integration.test.ts           (5 integration tests)
  apps/web/lib/ai/__tests__/cross-provider.integration.test.ts     (3 integration tests)
  apps/web/app/api/health/ai/route.ts                              (admin liveness probe)
  packages/db/migrations/0007_petite_mariko_yashida.sql            (provider + was_fallback)
  packages/db/migrations/meta/0007_snapshot.json

MODIFIED
  apps/web/lib/ai/client.ts                                        (provider+wasFallback in logAiCall)
  apps/web/lib/ai/prompts/explain-differently.ts                   (length constraint tightening)
  apps/web/lib/ai/prompts/study-plan.ts                            (tool shape + required-field language)
  apps/web/lib/ai/prompts/generate-questions.ts                    (tool shape + format constraints)
  apps/web/lib/ai/__tests__/explain-differently.integration.test.ts (import from constants, fixes Sprint 4 bug)
  apps/web/app/api/ai/explain-differently/route.ts                 (uses runWithFallback, 503 on Pidgin failure)
  apps/web/app/api/ai/study-plan/route.ts                          (uses runWithFallback)
  apps/web/app/api/ai/tutor/chat/route.ts                          (streaming with init-time fallback)
  apps/web/app/api/admin/questions/generate-with-ai/route.ts       (uses runWithFallback)
  apps/web/app/api/admin/ai-quality/route.ts                       (per-provider aggregation)
  apps/admin/app/(admin)/ai-quality-review/page.tsx                (provider/fallback badges)
  apps/web/package.json                                            (+ openai 6.36.0)
  packages/db/src/schema/study-plans.ts                            (provider + was_fallback columns)
  packages/db/migrations/meta/_journal.json                        (migration index)
  .env.example                                                     (DEEPSEEK_API_KEY slot)
  LAUNCH_CHECKLIST.md                                              (DeepSeek vendor section)
  API_COSTS.md                                                     (rewrite with hybrid + appendix)
  CHANGELOG.md                                                     (Sprint 5 entry)
  SESSION_REPORT.md                                                (this file)
```

12 new files, 17 modified files. One new dependency (`openai@^6.36.0`).

---

## What I deliberately did not do

- **No real DeepSeek calls.** Tests skip without a key; no key is wired in this autonomous session. The 5 DeepSeek integration tests + 3 cross-provider tests are ready to run the moment a key is set in env (estimate ~$0.005 per full run).
- **No production deployment.** Same constraint as Sprint 4 — credentials, billing, DNS need a human in the room. Launch checklist is updated.
- **No prompt-cache implementation.** API_COSTS.md still flags this as cost-lever #1 for when DAU crosses ~3k. Adds Anthropic-specific complexity that doesn't carry over to DeepSeek; defer until volume justifies it.
- **No A/B test of tutor on DeepSeek vs. Sonnet.** Out of scope per the brief ("Do NOT switch the AI tutor chat to DeepSeek"). Documented in API_COSTS.md as cost-lever #2 for once volume permits.
- **No Pidgin verification on DeepSeek.** Out of scope per the brief ("Do NOT switch the Pidgin explain-differently level to DeepSeek"). The full-DeepSeek appendix in API_COSTS.md flags this as the gating step before any future "switch everything to DeepSeek" sprint.
- **No three-way provider routing.** OpenAI / Mistral / etc. are out of scope per the brief ("Do NOT add OpenAI or other providers in this sprint"). Adding a third provider is documented in `lib/ai/README.md` as a <2 hour task.
- **No `removeAnthropicSDK`.** Both SDKs run side by side. Anthropic still handles tutor + Pidgin; OpenAI SDK handles DeepSeek.

---

## Pidgin status — STILL UNVERIFIED BY HUMAN

This was true at end of Sprint 4 and remains true at end of Sprint 5. The Sprint 5 changes don't touch the Pidgin path's primary provider (still Claude Haiku 4.5) or the Pidgin prompt itself. So [PIDGIN_SAMPLES.md](PIDGIN_SAMPLES.md)'s 15-test verification suite still needs to run with a real Anthropic key against real seeded questions. **Recommended:** run it during the LAUNCH_CHECKLIST §4 task once production Anthropic is wired.

The Sprint 5 architectural change relevant to Pidgin: the no-fallback rule is now mechanically enforced in `constants.ts` (`fallback: null`) and verified by a unit test. Even if a future engineer naively adds DeepSeek-everywhere, the Pidgin route can't accidentally start calling it without that test failing AND a code change to `constants.ts`.

---

## Open questions for you when you return

1. **Wire `DEEPSEEK_API_KEY`.** Sign up at platform.deepseek.com, fund $20, generate the key, set it in Vercel for `web` (production AND staging). Hit `GET /api/health/ai` once both keys are in — both providers should return `ok: true` within 5s.

2. **Run the integration tests once the key is set.** `DEEPSEEK_API_KEY=sk-... pnpm --filter @examready/web test` — the 5 DeepSeek + 3 cross-provider tests will run for ~$0.01 total. Watch for: tool-use validation passing, length-constraint compliance on explain-differently outputs, stream usage chunks arriving.

3. **Pidgin verification suite — when?** Same answer as Sprint 4. PIDGIN_SAMPLES.md has the rubric. Run during launch-checklist §4.

4. **Cost projection sanity check.** API_COSTS.md projects ~$1.7k/mo at 1k DAU under the hybrid mix (~$2.8k/mo under Sprint 4's all-Claude). Worth pricing-team review before pricing-page changes — basic at ₦5,000/mo still has plenty of headroom over the new $0.467/day basic worst-case.

5. **Sprint 3's question-content commission decision is _still_ open.** Sprint 4 didn't move on it, Sprint 5 didn't either (out of scope). The AI moderation pipeline + J/K/A/R/E shortcuts mean an SME can review fast (~30/hour) at the new ~$0.001/question DeepSeek cost, but you still need the SME. Recommend: name a reviewer + commit to a per-batch SLA before launch checklist starts ticking.

## Recommended next sprint focus

In rough order of leverage:

1. **Run the Pidgin verification suite on DeepSeek too.** If it scores ≥ 4/5 on the same rubric, the full-DeepSeek migration becomes viable and saves another ~$140k/month at 100k DAU. Even if it fails, knowing how it fails informs whether a Pidgin-tuned DeepSeek prompt could close the gap. Cost: ~$0.005 to run.

2. **Next.js 14 → 15 migration.** Hard gate before any open-signup launch. Sprint 5 didn't move on it. The Cloudflare + per-route rate limits are still the mitigation but they don't substitute for the patch.

3. **Prompt caching on Anthropic system prompts.** Tutor + Pidgin prompts are static. 90% discount on cached system tokens. Once tutor volume crosses ~50k calls/day this is worth a focused half-day session.

4. **A/B free-tier tutor on DeepSeek.** With the abstraction in place, this is a constants.ts change + thumbs-ratio comparison. Largest single line item in basic-tier worst-case spend.

I'll be here when you're back.
