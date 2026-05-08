# API Costs — DeepSeek-only with OpenAI fallback (Sprint 6)

Sprint 6 retired the Anthropic + DeepSeek hybrid in favour of DeepSeek-V3 for everything, with OpenAI gpt-4o-mini as an emergency fallback. This is a **pure cost-driven decision** — Anthropic's quality wasn't the issue, but at the DAU we're targeting and the price gap that exists today, paying ~10× for marginal quality on features that are bounded by daily caps anyway didn't pencil out.

> **Pricing assumed** (per million tokens, list price, subject to change — re-verify before pricing decisions):
>
> - DeepSeek-V3 (`deepseek-chat`): ~$0.27 input / ~$1.10 output (cache miss). Cached input ~$0.07. Verify at https://api-docs.deepseek.com/quick_start/pricing
> - DeepSeek-R1 (`deepseek-reasoner`): ~$0.55 input / ~$2.19 output. Used for study-plan + AI Examiner where structured-output reasoning quality matters.
> - OpenAI gpt-4o-mini (fallback only): $0.15 input / $0.60 output. Verify at https://platform.openai.com/docs/pricing
> - Anthropic models are not used — see lib/ai/README.md for re-enable steps.

## Per-feature unit cost (Sprint 6 DeepSeek-only)

| Feature                                      | Primary model       | Avg in / out tokens      | Cost per call (primary) | Cost per call (fallback gpt-4o-mini) |
| -------------------------------------------- | ------------------- | ------------------------ | ----------------------- | ------------------------------------ |
| `tutor_chat` (per multi-turn message)        | `deepseek-chat`     | ~700 in / ~400 out       | **$0.00063**            | $0.00034                             |
| `explain_differently` / simpler              | `deepseek-chat`     | ~500 in / ~250 out       | **$0.00041**            | $0.00022                             |
| `explain_differently` / with_analogy         | `deepseek-chat`     | ~500 in / ~250 out       | **$0.00041**            | $0.00022                             |
| `explain_differently` / step_by_step         | `deepseek-chat`     | ~500 in / ~250 out       | **$0.00041**            | $0.00022                             |
| `explain_differently` / pidgin (gated)       | `deepseek-chat`     | ~500 in / ~250 out       | **$0.00041**            | (no fallback)                        |
| `study_plan` (per generation)                | `deepseek-reasoner` | ~600 in / ~3500 out      | **$0.0080**             | $0.0021                              |
| `ai_examiner` / theory grading (NEW)         | `deepseek-reasoner` | ~1500 in / ~1500 out     | **$0.0041**             | $0.0011                              |
| `generate_questions` (per question, batched) | `deepseek-chat`     | ~400 in / ~800 out per Q | **$0.00099**            | $0.00054                             |

**Why fallback is cheaper than primary on some lines:** gpt-4o-mini is genuinely cheaper than deepseek-chat per output token in dollar terms today. We don't make it primary anyway because (a) latency is similar, (b) DeepSeek's quality on Nigerian-context output has been better in our internal spot-checks, (c) keeping the cheaper-but-different-vendor option in fallback position means DeepSeek vendor risk doesn't take us offline.

## Daily caps per tier (unchanged from Sprint 4)

| Feature                                                                    | Free                         | Basic | Pro       |
| -------------------------------------------------------------------------- | ---------------------------- | ----- | --------- |
| `tutor_chat` (per day)                                                     | 5                            | 50    | unlimited |
| `explain_differently` (per day, all levels combined)                       | 10                           | 100   | unlimited |
| `step_by_step` is bundled into the explain-differently cap (not separate). |                              |       |           |
| `study_plan` (per day)                                                     | 1                            | 5     | unlimited |
| `ai_examiner` (per day, NEW)                                               | 2                            | 20    | unlimited |
| `generate_questions`                                                       | admin-only — not user-facing |       |           |

Free-tier worst-case spend per user per day (Sprint 6):

- Tutor: 5 × $0.00063 = $0.0032
- Explain: 10 × $0.00041 = $0.0041
- Study plan: 1 × $0.0080 = $0.0080
- AI examiner: 2 × $0.0041 = $0.0082
- **Total: ~$0.024/day** (down from Sprint 5's $0.049/day — 51% saved on free tier)

Basic-tier worst-case (Sprint 6):

- Tutor: 50 × $0.00063 = $0.032
- Explain: 100 × $0.00041 = $0.041
- Study plan: 5 × $0.0080 = $0.040
- AI examiner: 20 × $0.0041 = $0.082
- **Total: ~$0.195/day** (down from Sprint 5's $0.467/day — 58% saved on basic tier)

The savings are bigger than Sprint 5 → Sprint 6 because tutor (the largest line item) is no longer pinned to Sonnet.

## Daily / monthly cost projections by DAU (Sprint 6)

Same tier mix (80% free / 15% basic / 5% pro). Pro = ~5× basic usage. Free uses 40% of cap on average; basic 35%; pro avg 200 calls/day across all features (slightly higher than Sprint 5 since AI examiner adds another high-quota feature for pros).

| DAU     | Free spend | Basic spend | Pro spend | **Sprint 6 daily** | **Monthly**   | Sprint 5 hybrid daily | Sprint 6 saving vs Sprint 5 |
| ------- | ---------- | ----------- | --------- | ------------------ | ------------- | --------------------- | --------------------------- |
| 1,000   | $7.7       | $10.2       | $14.0     | **~$32/day**       | **~$960/mo**  | $58/day               | -45%                        |
| 10,000  | $77        | $102        | $140      | **~$319/day**      | **~$9.6k/mo** | $569/day              | -44%                        |
| 100,000 | $768       | $1,024      | $1,400    | **~$3.2k/day**     | **~$96k/mo**  | $5,734/day            | -44%                        |

**At 100k DAU, Sprint 6 saves roughly $75k/month over Sprint 5's hybrid** — and ~$186k/month over Sprint 4's all-Claude. Cumulatively from Sprint 4 baseline: -66%.

## OpenAI fallback cost line item

Assume a 5% fallback rate (high; DeepSeek's published uptime is better than that, but we're being conservative and the new AI Examiner endpoint adds reasoning-model traffic that's harder to predict).

| DAU     | Daily total | Fallback share (5%) | Annualized fallback cost |
| ------- | ----------- | ------------------- | ------------------------ |
| 1,000   | $32         | $1.6/day            | ~$580/yr                 |
| 10,000  | $319        | $16/day             | ~$5.8k/yr                |
| 100,000 | $3,200      | $160/day            | ~$58k/yr                 |

If the fallback rate goes higher than 5% sustained for 24h, that's signal to either flip primary in `lib/ai/constants.ts` to OpenAI temporarily or open a DeepSeek support ticket. Watch the `was_fallback` count on `/admin/ai-quality-review`.

## Self-hosted local fallback scenario

When `LOCAL_AI_ENABLED=true` and a local server is reachable, non-critical features (explain-differently, questionGen) try local FIRST. Critical features (tutor, AI examiner, study plan) **always** go to DeepSeek regardless — the routing config flags them as `localOptIn: false`.

Hardware assumed: RTX 5080 (16GB) + RTX 3080 (16GB) — combined VRAM via tensor parallelism, ~32GB usable.

Recommended local models:

- `Qwen2.5-32B-Coder-Instruct` (4-bit quantized) for question generation. Fits comfortably in 24GB.
- `Llama-3.3-70B-Instruct` Q4_K_M for explanations. Borderline on 32GB combined; 48GB+ recommended for production.

Per-call cost on local: dominated by electricity + amortized hardware. At Nigerian grid prices (₦70/kWh, ~75% uptime, RTX-class drawing 350W avg) the hardware electricity is ~₦18,400/mo (~$12/mo at ₦1,500/$). With amortized hardware cost (₦1.4M / 24 months = ₦58k/mo), total ~$50/mo for unlimited usage. Compare to:

| DAU     | Sprint 6 cost (DeepSeek only) | With LOCAL_AI_ENABLED for non-critical                       | Saving     | Worth it?                                                            |
| ------- | ----------------------------- | ------------------------------------------------------------ | ---------- | -------------------------------------------------------------------- |
| 1,000   | $960/mo                       | ~$430/mo (~$50 local + DeepSeek for critical-only)           | $530/mo    | borderline (uptime risk vs $530 saved)                               |
| 10,000  | $9,600/mo                     | ~$4,200/mo (DeepSeek critical features still scale linearly) | $5,400/mo  | yes if you're in the box anyway for AI examiner training data review |
| 100,000 | $96,000/mo                    | ~$45,000/mo                                                  | $51,000/mo | yes — but operationally heavier than just paying DeepSeek            |

**Recommendation at launch:** keep `LOCAL_AI_ENABLED=false`. Production stability matters more than the saving until DAU is in the >10k range. Use the local setup for personal dev (the user has the GPUs already) and for one-off AI examiner sample reviews.

## Cost levers (Sprint 6 priority order)

1. **Prompt cache the static system prompts on DeepSeek.** Tutor + explain-differently + Pidgin prompts are static. DeepSeek's cached input is ~4× cheaper than uncached. Implement once we hit ~3k DAU.
2. **Cache explain-differently outputs by `(questionId, level)`.** Two students hitting "explain step-by-step" on the same question shouldn't double-bill us. A 24h Redis cache absorbs most volume on popular questions. Implement when explain-differently spend > $200/day.
3. **Switch `study_plan` from `deepseek-reasoner` to `deepseek-chat` for free tier.** Reasoner is expensive (~2× chat). Free tier study plans are 1/day per user, but at scale the line item adds up. A/B test plan quality first — see /admin/ai-quality-review.
4. **Compress recent-mistakes context in tutor.** Currently sends full stems for the last 3 mistakes. Could shrink to topic + correct-answer-only.
5. **Move heavy-cost features to local inference.** See above — only after volume justifies the operational complexity.

---

## Appendix A — Comparison to prior strategies

| Strategy                                                    | Sprint          | 1k DAU /mo | 10k DAU /mo | 100k DAU /mo | Active providers          |
| ----------------------------------------------------------- | --------------- | ---------- | ----------- | ------------ | ------------------------- |
| All-Claude (Sonnet for tutor/study/genQ, Haiku for explain) | 3-4             | $2,800     | $28,000     | $282,000     | Anthropic only            |
| Hybrid (Sonnet tutor + Haiku Pidgin + DeepSeek rest)        | 5               | $1,700     | $17,000     | $171,000     | Anthropic + DeepSeek      |
| **DeepSeek-only + OpenAI fallback**                         | **6 (current)** | **$960**   | **$9,600**  | **$96,000**  | **DeepSeek + OpenAI**     |
| With LOCAL_AI for non-critical (advanced)                   | 6 (opt-in)      | ~$430      | ~$4,200     | ~$45,000     | DeepSeek + OpenAI + local |

Sprint 4 → Sprint 6: -66% at every scale.

## Appendix B — Why we're not running everything on local

Even with the user's RTX 5080 + RTX 3080, production AI on local hardware would mean:

1. **Single point of failure.** One machine, one ISP. A power cut during JAMB registration week takes the platform's AI features offline.
2. **Latency from Vercel → home network.** DeepSeek's edge is sub-second in Frankfurt; a Vercel function calling Lagos home internet could be 2–5s round-trip on a bad day.
3. **Operations burden.** Model updates, OS updates, GPU driver hangs. None of these are catastrophic in dev; in production they translate to degraded student experience without you knowing.

Local is a fantastic dev environment and a nice-to-have for one-off batch jobs (e.g., generating training data for an AI examiner fine-tune). Production should be on a hosted API at this stage.

## Appendix C — Editorial factory cost line (Sprint 7)

The editorial factory is the new high-volume cost line. It runs on DeepSeek-V3 (cheapest tier) for everything — including the self-audit pass — because the per-item economics matter more than any quality edge from R1 on this kind of structured scoring.

| Item                                              | Pipeline call cost | Audit call cost | All-in (with 50% cache) |
| ------------------------------------------------- | ------------------ | --------------- | ----------------------- |
| Question fully processed (parse + enrich + audit) | ~$0.0008           | ~$0.0002        | **~$0.0010**            |
| Topic from syllabus (with description)            | ~$0.0003           | ~$0.0002        | **~$0.0005**            |
| University record (enriched)                      | ~$0.0001           | ~$0.0002        | **~$0.0003**            |
| Cutoff record (no enrich, audit only)             | $0                 | ~$0.0001        | **~$0.0001**            |
| Course-combination row                            | ~$0.0003           | ~$0.0002        | **~$0.0005**            |
| Reference article (no enrich, audit only)         | $0                 | ~$0.0002        | **~$0.0002**            |

Sprint envelopes:

| Workload                                                                             | Items  | Cost     |
| ------------------------------------------------------------------------------------ | ------ | -------- |
| 10,000 questions fully processed                                                     | 10,000 | ~$10     |
| Full Nigerian university dataset (200 universities + 5,000 courses + 20,000 cutoffs) | 25,200 | ~$5      |
| Full WAEC + NECO + JAMB syllabus (33 subjects × ~15 topics)                          | 495    | ~$0.25   |
| 30 lessons (Phase 6 sample)                                                          | 30     | ~$0.12   |
| **Full Sprint 7 content seed**                                                       | ~36k   | **~$15** |

The audit's prompt cache is the big lever — same system prompt across every item of the same pipeline means the cache-hit ratio approaches 0.7-0.8 once the run is past the first ~10 items. The numbers above assume a conservative 0.5.

> **The factory is throttled by reviewer time, not API cost.** Even at full 10k-question generation, the API bill is dwarfed by the ~₦200k reviewer budget for the moderation queue (LAUNCH_CHECKLIST §3).

## When to revisit

- Re-pull DeepSeek + OpenAI list prices monthly until DAU is stable.
- Re-run projections every quarter or when DAU 2× from last reading.
- If thumbs-down ratio for any feature on DeepSeek goes above 25%, revisit whether to add a quality-tier fallback (e.g., Sonnet for that specific feature only).
- If `was_fallback` count > 5% of any feature for 24h, flag in PRODUCTION_BUGS.md and consider primary swap.
