/**
 * Provider factory + fallback wrapper.
 *
 * Sprint 6 active providers:
 *  - 'deepseek' — primary for every feature
 *  - 'openai'   — emergency fallback (gpt-4o-mini)
 *  - 'local'    — opt-in self-hosted fallback (LOCAL_AI_ENABLED)
 *
 * 'anthropic' is a stub that always reports unconfigured (see
 * providers/anthropic.ts). It's kept in the factory map only so older
 * ai_usage_log rows with provider='anthropic' typecheck against the
 * union; it's never selected by routing in active features.
 *
 * For features with a fallback configured, callers use `runWithFallback`
 * so a transient DeepSeek 5xx automatically retries on OpenAI without
 * each call site reimplementing the try/catch dance.
 */
import { anthropicProvider } from './anthropic';
import { deepseekProvider } from './deepseek';
import { localProvider } from './local';
import { openaiProvider } from './openai';
import { type AiProvider, ProviderError, type ProviderName } from './types';

export type { AiProvider, ProviderName } from './types';
export {
  type ChatMessage,
  type CompletionParams,
  type CompletionResult,
  type StreamChunk,
  type ToolDefinition,
  type ToolUseParams,
  type ToolUseResult,
  ProviderError,
} from './types';

const PROVIDERS: Record<ProviderName, AiProvider> = {
  deepseek: deepseekProvider,
  openai: openaiProvider,
  local: localProvider,
  anthropic: anthropicProvider, // disabled stub — see providers/anthropic.ts
};

export function getProvider(name: ProviderName): AiProvider {
  return PROVIDERS[name];
}

export type ProviderModel = {
  provider: ProviderName;
  model: string;
};

/**
 * Run an operation against the primary provider/model. If it throws a
 * retryable ProviderError and a fallback is configured, retry on the
 * fallback. Returns the result plus metadata describing what actually
 * happened (so the caller can pass `wasFallback` / actual provider /
 * actual model into ai_usage_log).
 *
 * If `fallback` is null (Pidgin), the primary error rethrows unchanged.
 */
export type FallbackOutcome<T> = {
  result: T;
  provider: ProviderName;
  model: string;
  wasFallback: boolean;
};

export async function runWithFallback<T>(
  primary: ProviderModel,
  fallback: ProviderModel | null,
  op: (provider: AiProvider, model: string) => Promise<T>,
  /**
   * Optional provider resolver — defaults to the global factory. Tests
   * pass a fake resolver to inject mock providers without touching env
   * vars or SDK internals. Production code never sets this.
   */
  resolver: (name: ProviderName) => AiProvider = getProvider,
): Promise<FallbackOutcome<T>> {
  const primaryProvider = resolver(primary.provider);
  try {
    const result = await op(primaryProvider, primary.model);
    return {
      result,
      provider: primary.provider,
      model: primary.model,
      wasFallback: false,
    };
  } catch (err) {
    const retryable = err instanceof ProviderError && err.isRetryable;
    if (!retryable || !fallback) throw err;

    // eslint-disable-next-line no-console
    console.warn(
      `[ai] ${primary.provider} failed (retryable); falling back to ${fallback.provider}`,
      { primaryError: (err as Error).message },
    );

    const fallbackProvider = resolver(fallback.provider);
    const result = await op(fallbackProvider, fallback.model);
    return {
      result,
      provider: fallback.provider,
      model: fallback.model,
      wasFallback: true,
    };
  }
}
