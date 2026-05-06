/**
 * AI feature → provider/model routing (Sprint 6 DeepSeek-only).
 *
 * Sprint 6 strategy:
 *  - DeepSeek-V3 (`deepseek-chat`) primary for chat-style features.
 *  - DeepSeek-R1 (`deepseek-reasoner`) for features needing structured-
 *    output reasoning: study plan, AI examiner.
 *  - OpenAI gpt-4o-mini as the emergency fallback for every active
 *    feature. Triggers on DeepSeek 5xx / 408 / 429 / network.
 *  - Local inference (LOCAL_AI_ENABLED) opt-in for explain-differently
 *    and questionGen ONLY. Critical features (tutor, aiExaminer,
 *    studyPlan) ALWAYS go to DeepSeek; the local server never sees them.
 *  - Pidgin path is feature-flagged off via PIDGIN_ENABLED. Code,
 *    routing and prompt remain so it can be re-enabled once a
 *    Nigerian-fluent reviewer has verified the DeepSeek-side output.
 *
 * Anthropic is intentionally absent — it's commented out in
 * providers/anthropic.ts and not registered as a routing target. See
 * lib/ai/README.md for the why.
 */
import type { ProviderModel } from './providers';

export type FeatureRouting = {
  primary: ProviderModel;
  /** null = no fallback. Primary error propagates. */
  fallback: ProviderModel | null;
  /**
   * When LOCAL_AI_ENABLED=true AND the local provider isConfigured(),
   * the route resolver upgrades local to PRIMARY for this feature and
   * demotes the listed primary into fallback position. Critical features
   * (tutor, aiExaminer, studyPlan) leave this null so the local server
   * is never consulted regardless of env flag.
   */
  localOptIn: boolean;
};

const DEEPSEEK_CHAT: ProviderModel = {
  provider: 'deepseek',
  model: 'deepseek-chat',
};
const DEEPSEEK_REASONER: ProviderModel = {
  provider: 'deepseek',
  model: 'deepseek-reasoner',
};
const OPENAI_FALLBACK: ProviderModel = {
  provider: 'openai',
  model: 'gpt-4o-mini',
};

/**
 * Default model name for the local provider. The actual model loaded
 * on the local server is admin-configurable via env if needed; we just
 * pass through whatever name DeepSeek would have used so the local
 * server can ignore the model field or map it to its loaded model.
 */
const LOCAL_DEFAULT: ProviderModel = {
  provider: 'local',
  model: 'auto',
};

export const AI_MODELS = {
  tutor: {
    primary: DEEPSEEK_CHAT,
    fallback: OPENAI_FALLBACK,
    localOptIn: false, // critical: never route to local
  } satisfies FeatureRouting,
  explainDifferently: {
    simpler: {
      primary: DEEPSEEK_CHAT,
      fallback: OPENAI_FALLBACK,
      localOptIn: true,
    } satisfies FeatureRouting,
    with_analogy: {
      primary: DEEPSEEK_CHAT,
      fallback: OPENAI_FALLBACK,
      localOptIn: true,
    } satisfies FeatureRouting,
    step_by_step: {
      primary: DEEPSEEK_CHAT,
      fallback: OPENAI_FALLBACK,
      localOptIn: true,
    } satisfies FeatureRouting,
    pidgin: {
      primary: DEEPSEEK_CHAT,
      // Sprint 6: pidgin still has no fallback — Pidgin output quality
      // is unverified on every provider, so silently swapping would
      // mask a quality regression. Operators must explicitly enable
      // PIDGIN_ENABLED for this path to even reach the routing layer.
      fallback: null,
      localOptIn: false,
    } satisfies FeatureRouting,
  },
  studyPlan: {
    primary: DEEPSEEK_REASONER,
    fallback: OPENAI_FALLBACK,
    localOptIn: false, // critical: structured output needs DeepSeek-class quality
  } satisfies FeatureRouting,
  aiExaminer: {
    primary: DEEPSEEK_REASONER,
    fallback: OPENAI_FALLBACK,
    localOptIn: false, // critical: this is the new moat — quality must be high
  } satisfies FeatureRouting,
  questionGen: {
    primary: DEEPSEEK_CHAT,
    fallback: OPENAI_FALLBACK,
    localOptIn: true,
  } satisfies FeatureRouting,
} as const;

/**
 * Resolve a feature's effective primary + fallback at request time,
 * applying the local-opt-in rule. Returns the same { primary, fallback }
 * shape the call sites already pass to runWithFallback.
 *
 * When LOCAL_AI_ENABLED=true:
 *  - non-critical features (localOptIn=true) get primary=local,
 *    fallback=DeepSeek (NOT OpenAI — local failure → DeepSeek →
 *    if DeepSeek also fails, the call fails. We deliberately don't
 *    chain three providers because the second-line fallback is
 *    rarer than the first and adds latency to every error path).
 *  - critical features (localOptIn=false) are unchanged.
 */
export function resolveRouting(routing: FeatureRouting): {
  primary: ProviderModel;
  fallback: ProviderModel | null;
} {
  const localEnabled = process.env.LOCAL_AI_ENABLED === 'true' && !!process.env.LOCAL_AI_BASE_URL;
  if (routing.localOptIn && localEnabled) {
    return {
      primary: LOCAL_DEFAULT,
      fallback: routing.primary, // demote DeepSeek into fallback slot
    };
  }
  return { primary: routing.primary, fallback: routing.fallback };
}

/**
 * Map an explain-differently `level` to the routing key. Sprint 6
 * unified levels to snake_case so this mapping is now identity for
 * the three always-on levels and an explicit branch for pidgin.
 */
export function explainLevelToRoutingKey(
  level: 'simpler' | 'with_analogy' | 'step_by_step' | 'pidgin',
): 'simpler' | 'with_analogy' | 'step_by_step' | 'pidgin' {
  return level;
}
