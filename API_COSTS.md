# API Costs — Anthropic + DeepSeek (hybrid)

Projections for AI API spend under the Sprint 5 hybrid provider strategy. The free tier has hard daily caps, the basic tier has higher caps, and pro is unlimited — so cost is bounded per user even before tier mix is considered.

> **Pricing assumed** (per million tokens, list price, subject to change — re-verify before pricing decisions):
>
> - Anthropic Sonnet 4.6: $3 input / $15 output
> - Anthropic Haiku 4.5: $0.25 input / $1.25 output
> - DeepSeek-V3 (`deepseek-chat`): ~$0.27 input / ~$1.10 output (cache miss). Verify at https://api-docs.deepseek.com/quick_start/pricing — cached input is meaningfully cheaper.
> - Anthropic Opus 4.7 is not used in any production endpoint.

DeepSeek is roughly **5× cheaper than Haiku** per token and **30–60× cheaper than Sonnet** per token. The hybrid strategy keeps Sonnet for tutor (where it matters) and Haiku for Pidgin (the moat), and pushes everything else to DeepSeek.

## Per-feature unit cost (hybrid routing)

| Feature                                      | Primary provider/model | Avg in / out tokens      | Cost per call (primary) | Cost per call (fallback)  |
| -------------------------------------------- | ---------------------- | ------------------------ | ----------------------- | ------------------------- |
| `tutor_chat` (per multi-turn message)        | Anthropic Sonnet 4.6   | ~700 in / ~400 out       | **$0.0081**             | DeepSeek: ~$0.0006        |
| `explain_differently` / simpler              | DeepSeek-V3            | ~500 in / ~250 out       | **$0.00041**            | Haiku: ~$0.00044          |
| `explain_differently` / analogy              | DeepSeek-V3            | ~500 in / ~250 out       | **$0.00041**            | Haiku: ~$0.00044          |
| `explain_differently` / **pidgin**           | Anthropic Haiku 4.5    | ~500 in / ~250 out       | **$0.00044**            | (none — never falls back) |
| `study_plan` (per generation)                | DeepSeek-V3            | ~600 in / ~3500 out      | **$0.0040**             | Haiku: ~$0.0045           |
| `generate_questions` (per question, batched) | DeepSeek-V3            | ~400 in / ~800 out per Q | **$0.00099**            | Haiku: ~$0.0011           |

The main cost lever the hybrid captures: **study-plan dropped from $0.054 (Sprint 3-4 all-Sonnet) to $0.004 (Sprint 5 DeepSeek primary)** — a 13× reduction on the most expensive single-call feature. Question generation dropped from $0.013 to $0.001, a similar 13× reduction.

## Daily caps per tier (unchanged from Sprint 4)

| Feature                                              | Free                         | Basic | Pro       |
| ---------------------------------------------------- | ---------------------------- | ----- | --------- |
| `tutor_chat` (per day)                               | 5                            | 50    | unlimited |
| `explain_differently` (per day, all levels combined) | 10                           | 100   | unlimited |
| `study_plan` (per day)                               | 1                            | 5     | unlimited |
| `generate_questions`                                 | admin-only — not user-facing |       |           |

Free-tier worst-case spend per user per day under the **hybrid** strategy:

- Tutor: 5 × $0.0081 = $0.0405
- Explain-differently (assume 7 simpler/analogy on DeepSeek + 3 pidgin on Haiku): 7 × $0.00041 + 3 × $0.00044 = $0.0042
- Study plan: 1 × $0.004 = $0.004
- **Total: ~$0.049/day** (down from Sprint 4's $0.099/day — about 50% saved on free)

Basic-tier worst-case under hybrid:

- Tutor: 50 × $0.0081 = $0.405
- Explain (70 DeepSeek + 30 Haiku): 70 × $0.00041 + 30 × $0.00044 = $0.042
- Study plan: 5 × $0.004 = $0.020
- **Total: ~$0.467/day** (down from $0.715 — about 35% saved on basic)

The basic-tier savings are smaller because tutor on Sonnet is the dominant line item there; that doesn't move. To squeeze basic further, the lever is "switch tutor to Haiku for free + basic" (test thumbs ratio first — see lib/ai/README.md).

## Daily / monthly cost projections by DAU (hybrid)

Same tier mix as Sprint 4 (80% free / 15% basic / 5% pro). Pro = ~5× basic usage. Free uses 40% of cap on average; basic 35%; pro avg 150 calls/day across all features.

| DAU     | Free   | Basic  | Pro    | **Daily total (hybrid)** | **Monthly**   | **Daily total (Sprint 4 all-Claude)** | **Hybrid savings** |
| ------- | ------ | ------ | ------ | ------------------------ | ------------- | ------------------------------------- | ------------------ |
| 1,000   | $16    | $20    | $22    | **~$58/day**             | **~$1.7k/mo** | $94/day                               | -38%               |
| 10,000  | $157   | $196   | $216   | **~$569/day**            | **~$17k/mo**  | $939/day                              | -39%               |
| 100,000 | $1,570 | $1,961 | $2,162 | **~$5.7k/day**           | **~$171k/mo** | $9,386/day                            | -39%               |

The savings hold roughly linear with DAU because the cost mix doesn't change shape — tutor is still Sonnet, everything else moved to DeepSeek. **At 100k DAU, the hybrid saves roughly $111k/month vs. all-Claude.**

Worth noting: these are list prices. With prompt caching enabled (system prompts are static and re-used across every call), Sonnet/Haiku tutor + Pidgin calls drop another 30–60% on cache hits. We don't model that below — it's a tailwind, not a load-bearing assumption.

## Fallback cost

When DeepSeek 5xx kicks the call to Haiku, the per-call cost rises ~10% (Haiku is ~5× per-token but the fallback features have small response sizes). At a 1% fallback rate (a reasonable upper bound for DeepSeek's expected uptime), fallback cost is in the noise — under $5/month at 10k DAU.

If DeepSeek has a sustained outage and fallback rate stays high, watch `/admin/ai-quality-review` for per-feature `wasFallback` count. A fallback rate above 5% for 24h is signal to flip the primary back to Anthropic temporarily by editing `lib/ai/constants.ts`.

## Admin question-generation cost (hybrid)

Separate from per-user spend. Admin runs `/admin/questions/generate` to seed content.

- **Per question generated** (DeepSeek primary, batched 10 at a time): ~$0.001
- **Per 100-question batch:** ~$0.10
- **Seed all 11 subjects × ~50 questions each (550 total):** ~$0.55

Down from Sprint 4's $7.15 — a 13× reduction. Reviewer time still dominates the actual cost (30 questions/hour at any non-zero hourly rate dwarfs the API cost). Optimize moderator throughput (the J/K/A/R/E shortcuts shipped in Sprint 4) before optimizing generation cost.

## Cost levers (in priority order, post-hybrid)

1. **Prompt caching the static system prompts.** Tutor + explain-differently + Pidgin prompts are static and re-used across every call. The `system` field caches at 90% discount on Anthropic. Implement once we hit ~3k DAU.
2. **Move tutor chat to DeepSeek for free tier only.** Tutor is the single largest line item per active free user even under hybrid. DeepSeek would be ~14× cheaper. Worth A/B testing thumbs ratio Sonnet-vs-DeepSeek before deciding — and only ever for free tier (paying users keep Sonnet).
3. **Cache explain-differently outputs by `(questionId, level)`.** Two students hitting "explain in pidgin" on the same question shouldn't double-bill us. A 24h Redis cache on the (questionId, level) → explanation pair would absorb most of the volume on popular questions. Implement when explain-differently spend > $200/day across providers.
4. **Compress recent-mistakes context in tutor.** We currently send full stems for the last 3 mistakes. Could shrink to topic + correct-answer-only. Not yet quantified.

---

## Appendix: what if we full-switch to DeepSeek?

Routing every feature (including tutor and Pidgin) to DeepSeek-V3 would save another step:

| DAU     | Hybrid cost | Full-DeepSeek cost | Additional saving |
| ------- | ----------- | ------------------ | ----------------- |
| 1,000   | $58/day     | ~$8/day            | -86%              |
| 10,000  | $569/day    | ~$80/day           | -86%              |
| 100,000 | $5.7k/day   | ~$800/day          | -86%              |

So another **~$140k/month at 100k DAU**. That's not nothing. **The reason we're not doing this:**

1. **Pidgin** — the Pidgin variant is the platform's biggest differentiator. DeepSeek's Nigerian Pidgin output is unverified. Until we run the 15-test PIDGIN_SAMPLES.md suite against DeepSeek and get a ≥ 4/5 average score, we cannot route Pidgin away from Claude without silently degrading the moat. **Action item:** when DeepSeek key is wired in production, run the suite against `deepseekProvider.completion()` for the Pidgin prompt. If it passes, this appendix becomes the next migration.
2. **Tutor multi-turn reasoning** — DeepSeek-V3 is competitive with Sonnet on benchmark reasoning, but the _Nigerian-English register_ in the tutor system prompt has been hand-tuned for Claude. Switching providers means re-tuning. Not a moat, just engineering effort. **Action item:** A/B test thumbs ratio for free-tier tutor on DeepSeek vs. Sonnet for 2 weeks once volume permits.

If both action items pass, full-switching is on the table for the next sprint.

## When to revisit

- Re-pull list prices for both providers before any pricing-page change to tier caps.
- Re-run projections every quarter or when DAU 2× from last reading.
- If thumbs-down ratio for any DeepSeek-routed feature goes above 30%, revisit the routing for that feature before raising caps — bad output is more expensive than no output.
- If `wasFallback` count > 5% of any feature for 24h, flip the primary in `constants.ts` temporarily.
