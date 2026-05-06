/**
 * Provider factory + fallback wrapper.
 *
 * Call sites resolve a provider by name (`getProvider('anthropic')`) and
 * use the AiProvider interface — they don't import the SDK directly.
 *
 * For features that have a fallback configured, use `runWithFallback` so
 * a transient DeepSeek 5xx automatically retries on Claude (and vice
 * versa) without each call site reimplementing the try/catch dance.
 *
 * The Pidgin path is the lone exception: it has `fallback: null` in the
 * routing config, so `runWithFallback` rethrows the primary's error
 * without ever calling DeepSeek. That's deliberate — see lib/ai/README.md.
 */
import { anthropicProvider } from './anthropic';
import { deepseekProvider } from './deepseek';
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
  anthropic: anthropicProvider,
  deepseek: deepseekProvider,
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
