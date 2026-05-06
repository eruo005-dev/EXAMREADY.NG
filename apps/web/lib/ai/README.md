# AI provider strategy

ExamReady runs a **hybrid Anthropic + DeepSeek** setup. Each AI feature has a primary provider and (usually) a fallback; the routing is defined in [`constants.ts`](./constants.ts) and resolved at request time via the abstraction in [`providers/`](./providers).

Why hybrid: Claude is significantly more expensive than DeepSeek, but two features depend on quality that DeepSeek hasn't yet been verified at — multi-turn tutor reasoning and authentic Nigerian Pidgin. Routing those two through Claude and everything else through DeepSeek captures most of the cost win without compromising the parts students actually feel.

## Routing table

| Feature                           | Primary           | Fallback         | Why                                                                                                                            |
| --------------------------------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Tutor chat                        | Claude Sonnet 4.6 | DeepSeek-V3      | Multi-turn reasoning + Nigerian-English register tuning are where quality matters most.                                        |
| Explain-differently / **simpler** | DeepSeek-V3       | Claude Haiku 4.5 | High volume, lower stakes, plain-English rewrite.                                                                              |
| Explain-differently / **analogy** | DeepSeek-V3       | Claude Haiku 4.5 | Same — analogy quality is mostly about the prompt.                                                                             |
| Explain-differently / **pidgin**  | Claude Haiku 4.5  | **NONE**         | The Pidgin moat. DeepSeek's Pidgin is unverified — silently swapping providers would degrade the moat without anyone noticing. |
| Study plan                        | DeepSeek-V3       | Claude Haiku 4.5 | Structured tool-use output, low quality risk, low volume.                                                                      |
| Admin question generation         | DeepSeek-V3       | Claude Haiku 4.5 | Human-reviewed before going live, so the cost win matters more than the last 5%.                                               |

**Pidgin is the lone exception.** When the Pidgin path fails, the API returns 503 to the client and the UI suggests "Try a different explanation style." We do _not_ silently call DeepSeek for Pidgin even if it's the only provider available.

**Why Haiku as the fallback (not Sonnet)?** Two reasons:

1. **Cost** — fallback is a tail event, no need to pay Sonnet rates.
2. **Capability** — Haiku runs the same JSON tool schema; quality difference on structured output is small.

## Architecture

```
lib/ai/
├── constants.ts          ← Routing table (AI_MODELS)
├── client.ts             ← logAiCall + countAiCallsToday (telemetry sink)
├── quota.ts              ← Two-layer rate limit (Redis + DB)
├── providers/
│   ├── types.ts          ← AiProvider interface, ChatMessage, ToolDefinition
│   ├── anthropic.ts      ← Claude wrapper, ProviderError on retryable 5xx/429
│   ├── deepseek.ts       ← OpenAI-SDK pointed at api.deepseek.com/v1
│   └── index.ts          ← getProvider() factory + runWithFallback()
└── prompts/              ← Per-feature prompts + Zod schemas + tool defs
```

Call sites use the abstraction:

```ts
import { runWithFallback } from '@/lib/ai/providers';
import { AI_MODELS } from '@/lib/ai/constants';

const outcome = await runWithFallback(
  AI_MODELS.studyPlan.primary,
  AI_MODELS.studyPlan.fallback,
  (provider, model) => provider.toolUse({ ... }),
);
// outcome.result, outcome.provider, outcome.model, outcome.wasFallback
```

The `outcome` carries which provider actually answered, so the call site can pass it into `logAiCall` and the admin dashboard can see the per-provider breakdown.

## Adding a third provider

Should take well under 2 hours. Steps:

1. Create `providers/<name>.ts` exporting an object that satisfies the `AiProvider` interface from `providers/types.ts`. For OpenAI-compatible providers (Mistral, Together AI, Groq, etc.) you can copy `deepseek.ts` and change the base URL + model IDs. For everything else, new SDK + adapter logic.
2. Add the provider name to the `ProviderName` union in `providers/types.ts`.
3. Wire it into the factory map in `providers/index.ts`.
4. Decide routing — add the provider to one or more entries in `AI_MODELS` in `constants.ts`. Don't change existing routes unless you're explicitly retiring an old one.
5. Add a probe entry to `apps/web/app/api/health/ai/route.ts` so the admin can verify it's live.
6. Add an env var slot in `.env.example` and the launch checklist.
7. Add an integration test in `__tests__/<name>.integration.test.ts` (skip when key missing — never run on CI without budget gating).
8. Update this README's routing table.

## Failure modes worth knowing

- **DeepSeek transient 5xx**: handled by `runWithFallback`. The call falls back to Claude Haiku and logs `wasFallback: true`. Watch the `/admin/ai-quality-review` page for fallback frequency — if it stays > 1% for any feature, that's a signal to revisit the routing decision.
- **DeepSeek tool_call returns invalid JSON in `arguments`**: the adapter raises `ProviderError(isRetryable: false)`, so the fallback runs. (Retry on Claude is more likely to succeed than retry on DeepSeek with the same prompt.)
- **Anthropic 429 (rate limit)**: marked retryable, falls back to DeepSeek. Once Anthropic recovers, traffic returns to primary on the next request.
- **Both providers down simultaneously**: caller surfaces 502/503; client shows a "Try again" message. PostHog alerting via `ai_call_failed` events.
- **Pidgin path during an Anthropic outage**: returns 503 to the client. The UI's `ExplanationCard` should suggest "Simpler English" or "With an analogy" so the student can still re-explain — they just can't get Pidgin until Anthropic recovers.

## Cost

See [API_COSTS.md](../../../../API_COSTS.md) for projections at 1k / 10k / 100k DAU under the hybrid mix and a comparison appendix for "what if we full-switch to DeepSeek."
