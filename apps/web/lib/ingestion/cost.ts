/**
 * DeepSeek cost-tracking helper for the editorial factory.
 *
 * Pricing source: https://api-docs.deepseek.com/quick_start/pricing
 *
 * The pricing matters because the factory exists to keep cost-per-question
 * under $0.001 — every component (enrich, audit) reports its USD cost so
 * `/admin/editorial` can show projected total to the operator.
 *
 * We deliberately use TEXT in the DB schema (cost_usd) rather than NUMERIC
 * to avoid float drift during accumulation; admins format on display.
 */

/** USD per 1M tokens. Edit when DeepSeek changes pricing. */
const PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  // DeepSeek V3 (chat) — the volume worker.
  // As of Sprint 7: cache HIT $0.07 / 1M, cache MISS $0.27 / 1M, output $1.10 / 1M.
  'deepseek-chat': {
    input: 0.27,
    cachedInput: 0.07,
    output: 1.1,
  },
  // DeepSeek R1 (reasoner) — for AI Examiner / study plan; rarely used by
  // the editorial factory but priced here for completeness.
  'deepseek-reasoner': {
    input: 0.55,
    cachedInput: 0.14,
    output: 2.19,
  },
  // OpenAI gpt-4o-mini — emergency fallback.
  'gpt-4o-mini': {
    input: 0.15,
    cachedInput: 0.075,
    output: 0.6,
  },
};

const FALLBACK_PRICING = { input: 0.5, cachedInput: 0.1, output: 1.5 };

export function priceFor(model: string): { input: number; cachedInput: number; output: number } {
  return PRICING[model] ?? FALLBACK_PRICING;
}

/** Estimate USD cost for a single completion call. */
export function estimateCost(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Approximate cache-hit ratio for the input tokens (0..1). */
  cacheHitRatio?: number;
}): number {
  const { model, inputTokens, outputTokens } = args;
  const cacheHitRatio = Math.max(0, Math.min(1, args.cacheHitRatio ?? 0));
  const p = priceFor(model);
  const cachedInput = inputTokens * cacheHitRatio;
  const freshInput = inputTokens - cachedInput;
  const usd =
    (cachedInput * p.cachedInput) / 1_000_000 +
    (freshInput * p.input) / 1_000_000 +
    (outputTokens * p.output) / 1_000_000;
  return usd;
}

/** Format USD as a 4-decimal string for the cost_usd TEXT column. */
export function formatCostUsd(usd: number): string {
  return usd.toFixed(6);
}
