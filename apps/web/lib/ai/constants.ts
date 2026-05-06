/**
 * AI feature → provider/model routing.
 *
 * The shape is nested: top-level features expose either a single
 * { primary, fallback } pair or, for explain-differently, a per-level map.
 *
 * Sprint 5 hybrid strategy:
 *  - Tutor chat                    → Claude Sonnet 4.6 primary (quality matters)
 *  - Explain-differently / pidgin  → Claude Haiku 4.5 primary (the Pidgin moat)
 *                                    NO fallback (DeepSeek's Pidgin unverified)
 *  - Explain-differently / simpler → DeepSeek primary, Claude Haiku fallback
 *  - Explain-differently / analogy → DeepSeek primary, Claude Haiku fallback
 *  - Study plan                    → DeepSeek primary, Claude Haiku fallback
 *  - Admin question generation     → DeepSeek primary, Claude Haiku fallback
 *
 * Why Haiku as the fallback (not Sonnet)? Two reasons: (1) cost — fallback
 * is a tail event, no need to pay Sonnet rates for it. (2) Capability —
 * Haiku can run the same JSON tool_use schema; quality difference on
 * structured output is small.
 *
 * Why these exact splits? See lib/ai/README.md.
 */
import type { ProviderModel } from './providers';

export type FeatureRouting = {
  primary: ProviderModel;
  /** null = no fallback (Pidgin only). Primary error propagates as 503. */
  fallback: ProviderModel | null;
};

const CLAUDE_SONNET: ProviderModel = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
};
const CLAUDE_HAIKU: ProviderModel = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001',
};
const DEEPSEEK_CHAT: ProviderModel = {
  provider: 'deepseek',
  model: 'deepseek-chat',
};

export const AI_MODELS = {
  tutor: {
    primary: CLAUDE_SONNET,
    fallback: DEEPSEEK_CHAT,
  } satisfies FeatureRouting,
  explainDifferently: {
    simpler: {
      primary: DEEPSEEK_CHAT,
      fallback: CLAUDE_HAIKU,
    } satisfies FeatureRouting,
    analogy: {
      primary: DEEPSEEK_CHAT,
      fallback: CLAUDE_HAIKU,
    } satisfies FeatureRouting,
    pidgin: {
      primary: CLAUDE_HAIKU,
      fallback: null, // do not silently degrade the Pidgin moat
    } satisfies FeatureRouting,
  },
  studyPlan: {
    primary: DEEPSEEK_CHAT,
    fallback: CLAUDE_HAIKU,
  } satisfies FeatureRouting,
  questionGen: {
    primary: DEEPSEEK_CHAT,
    fallback: CLAUDE_HAIKU,
  } satisfies FeatureRouting,
} as const;

/**
 * Map an explain-differently `level` (the `simpler | with-analogy |
 * in-pidgin` enum used in the API contract) to the routing key.
 */
export function explainLevelToRoutingKey(
  level: 'simpler' | 'with-analogy' | 'in-pidgin',
): 'simpler' | 'analogy' | 'pidgin' {
  switch (level) {
    case 'simpler':
      return 'simpler';
    case 'with-analogy':
      return 'analogy';
    case 'in-pidgin':
      return 'pidgin';
  }
}
