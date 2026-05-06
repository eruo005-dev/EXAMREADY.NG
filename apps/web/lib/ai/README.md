# AI provider strategy

Sprint 6 retired the Anthropic + DeepSeek hybrid in favour of **DeepSeek-V3 for everything, with OpenAI gpt-4o-mini as emergency fallback**. Local inference (LOCAL_AI_ENABLED) is an opt-in fallback for non-critical features.

Why the switch: at our DAU, the price gap (~10×) between Claude and DeepSeek doesn't pencil out for daily-cap-bounded features. Claude's quality wasn't the issue — DeepSeek's output passed our internal spot-checks for every active feature. Anthropic stays in the codebase as commented-out dead code so we can re-introduce it cleanly if future quality issues surface.

## Routing table

| Feature                                             | Primary                | Fallback           | Local opt-in? |
| --------------------------------------------------- | ---------------------- | ------------------ | ------------- |
| Tutor chat                                          | DeepSeek-V3            | OpenAI gpt-4o-mini | ❌ critical   |
| Explain-differently / `simpler`                     | DeepSeek-V3            | OpenAI gpt-4o-mini | ✅            |
| Explain-differently / `with_analogy`                | DeepSeek-V3            | OpenAI gpt-4o-mini | ✅            |
| Explain-differently / `step_by_step` (NEW Sprint 6) | DeepSeek-V3            | OpenAI gpt-4o-mini | ✅            |
| Explain-differently / `pidgin` (FEATURE-FLAGGED)    | DeepSeek-V3            | **NONE**           | ❌            |
| Study plan                                          | DeepSeek-R1 (reasoner) | OpenAI gpt-4o-mini | ❌ critical   |
| **AI Examiner** (NEW Sprint 6)                      | DeepSeek-R1 (reasoner) | OpenAI gpt-4o-mini | ❌ critical   |
| Admin question generation                           | DeepSeek-V3            | OpenAI gpt-4o-mini | ✅            |

**Pidgin special-cases:**

1. The level itself is feature-flagged off via `PIDGIN_ENABLED` env var (default `false`). The route returns `404 FEATURE_DISABLED` when called and the level is `pidgin` while the flag is unset. Code, prompt, and routing are all retained — only the gate is closed.
2. Even when enabled, Pidgin has `fallback: null` — a primary failure surfaces as 503 rather than silently swap providers. Pidgin's quality on each provider is a separate verification, so silently falling back to a different model would mask a regression.

**localOptIn rule:** when `LOCAL_AI_ENABLED=true` and `LOCAL_AI_BASE_URL` points at a reachable OpenAI-compatible server, `resolveRouting()` upgrades local to PRIMARY for `localOptIn: true` features and demotes DeepSeek into the fallback slot. Critical features (`localOptIn: false`) are never routed to local — quality matters more there than cost savings.

## Architecture

```
lib/ai/
├── constants.ts          ← AI_MODELS routing + resolveRouting()
├── client.ts             ← logAiCall + countAiCallsToday (telemetry sink)
├── quota.ts              ← Two-layer rate limit (Redis + DB)
├── providers/
│   ├── types.ts          ← AiProvider interface, ChatMessage, ToolDefinition
│   ├── deepseek.ts       ← Primary — OpenAI-SDK at api.deepseek.com/v1
│   ├── openai.ts         ← Emergency fallback — gpt-4o-mini
│   ├── local.ts          ← Opt-in self-hosted (OpenAI-compatible)
│   ├── anthropic.ts      ← DISABLED stub (kept for future re-introduction)
│   └── index.ts          ← getProvider() factory + runWithFallback()
└── prompts/              ← Per-feature prompts + Zod schemas + tool defs
```

Call sites use the abstraction via `resolveRouting`:

```ts
import { runWithFallback } from '@/lib/ai/providers';
import { AI_MODELS, resolveRouting } from '@/lib/ai/constants';

const routing = resolveRouting(AI_MODELS.studyPlan);
const outcome = await runWithFallback(
  routing.primary,
  routing.fallback,
  (provider, model) => provider.toolUse({ ... }),
);
// outcome.result, outcome.provider, outcome.model, outcome.wasFallback
```

The `outcome` carries which provider actually answered, so the call site can pass it into `logAiCall` and the admin dashboard can see the per-provider breakdown.

## Re-enabling Pidgin

1. **Get human verification first.** Generate samples with `DEEPSEEK_API_KEY=...` set + `PIDGIN_ENABLED=true` temporarily on a staging deployment. Run the suite from PIDGIN_SAMPLES.md against real questions.
2. **Score each sample** on the 4-axis rubric (authenticity / clarity / tech-term preservation / negative-marker absence).
3. **Pass criterion:** average ≥ 4/5 across the suite, no single sample ≤ 2 on any axis.
4. **If pass:** set `PIDGIN_ENABLED=true` AND `NEXT_PUBLIC_PIDGIN_ENABLED=true` in production. The UI surfaces the option and the API accepts the level.
5. **If fail:** tighten the prompt in `prompts/explain-differently.ts`, re-run.

## Re-enabling Anthropic

The Anthropic adapter is commented dead code in `providers/anthropic.ts`. To re-enable:

1. Uncomment the implementation block.
2. Replace the stub `anthropicProvider` export with the real one (rename `anthropicProviderImpl` → `anthropicProvider`).
3. Re-add `ANTHROPIC_API_KEY` to the active section of `.env.example`.
4. Update `AI_MODELS` in `lib/ai/constants.ts` to route the relevant feature.
5. Update this README's routing table.

## Adding a third primary provider

Should take well under 2 hours. Steps:

1. Create `providers/<name>.ts` exporting an object that satisfies the `AiProvider` interface from `providers/types.ts`. For OpenAI-compatible providers (Mistral, Together AI, Groq, etc.) you can copy `deepseek.ts` and change the base URL + model IDs. For everything else, new SDK + adapter logic.
2. Add the provider name to the `ProviderName` union in `providers/types.ts`.
3. Wire it into the `PROVIDERS` map in `providers/index.ts`.
4. Decide routing — add the provider to one or more entries in `AI_MODELS` in `constants.ts`. Don't change existing routes unless you're explicitly retiring one.
5. Add a probe entry to `apps/web/app/api/health/ai/route.ts`.
6. Add an env var slot in `.env.example` and the launch checklist.
7. Add an integration test in `__tests__/<name>.integration.test.ts` (skip when key missing).
8. Update this README's routing table.

## Failure modes worth knowing

- **DeepSeek transient 5xx:** `runWithFallback` routes to OpenAI gpt-4o-mini. `wasFallback: true` is logged. Watch `/admin/ai-quality-review` for fallback frequency — > 5% sustained for 24h means open a DeepSeek support ticket or flip primary.
- **DeepSeek tool_call returns invalid JSON in `arguments`:** the adapter raises `ProviderError(isRetryable: false)`, so the fallback runs. (Retry on the same prompt + same model wouldn't help, but a different model might.)
- **OpenAI 429:** marked retryable but it's the FALLBACK — there's no second-line fallback. The call fails with 502. Keep OpenAI billing alerts low so you notice if traffic skews to fallback.
- **Both providers down simultaneously:** caller surfaces 502; client shows a "Try again" message. PostHog alerting via `ai_call_failed` events.
- **Pidgin path during a DeepSeek outage:** returns 503 to the client. The UI's `ExplanationCard` should suggest "Simpler English", "Step-by-step", or "With an analogy" so the student can still re-explain — they just can't get Pidgin until DeepSeek recovers.
- **Local server down (when LOCAL_AI_ENABLED):** the local provider returns retryable error → falls back to DeepSeek. Latency penalty is one local timeout (~10s if poorly configured) plus the DeepSeek call. Tune your local server's timeout aggressively.

## Local inference setup (advanced, opt-in)

Default-off. Enable with:

```bash
# .env.production (or Vercel env)
LOCAL_AI_ENABLED=true
LOCAL_AI_BASE_URL=http://192.168.1.50:11434/v1   # Ollama default
```

Suggested model loadout:

- **Qwen2.5-32B-Coder-Instruct** for question generation. Fits comfortably in 24GB. Strong at structured output.
- **Llama-3.3-70B-Instruct** Q4_K_M for explanations. Borderline on 32GB combined VRAM (RTX 5080 + RTX 3080); 48GB+ recommended for sustained production.

The `model` field passed by `runWithFallback` to the local server is whatever the routing config has (currently `'auto'`). Configure your local server to map this to whichever model you've loaded — Ollama's `OLLAMA_MODELS` env var or a model alias works fine.

**This is for personal dev / one-off batch use.** Production at launch DAU should stay on hosted DeepSeek — see API_COSTS.md "Why we're not running everything on local."

## Cost

See [API_COSTS.md](../../../../API_COSTS.md) for projections at 1k / 10k / 100k DAU under DeepSeek-only routing, plus the local-fallback scenario and prior-strategy comparison appendices.
