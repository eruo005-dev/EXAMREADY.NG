/**
 * Provider-agnostic types for AI calls.
 *
 * The two operations both providers MUST implement:
 *  - completion: single text response
 *  - stream:     async iterable of text chunks (for chat UX)
 *  - toolUse:    structured output (Anthropic tool_use ↔ OpenAI function calling)
 *
 * The shape is intentionally narrow. Anthropic's SDK accepts much more
 * (top_k, stop_sequences, metadata, multi-modal blocks) and so does
 * OpenAI's. We only expose what the four EXAMREADY features actually use,
 * because every parameter we surface is a parameter we have to support
 * across every future provider too.
 */

/**
 * Provider names recognised by the abstraction.
 *
 * Sprint 6 migration:
 *  - 'deepseek' is the primary for every feature
 *  - 'openai' is the emergency fallback (gpt-4o-mini)
 *  - 'local' is the opt-in self-hosted fallback for non-critical features
 *  - 'anthropic' is registered for backwards compatibility with stored
 *    ai_usage_log rows (where older calls have provider='anthropic'),
 *    but the provider itself is COMMENTED OUT in lib/ai/providers/anthropic.ts
 *    and not registered in the factory. Code stays for future re-introduction.
 */
export type ProviderName = 'deepseek' | 'openai' | 'local' | 'anthropic';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type CompletionParams = {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** Default 0.7 — providers translate to their native scales internally. */
  temperature?: number;
};

export type CompletionResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export type StreamChunk =
  | { kind: 'text'; text: string }
  | { kind: 'usage'; inputTokens?: number; outputTokens?: number };

/**
 * JSON-Schema for the tool's input. We use a schema-only definition
 * (no provider-specific framing) and each provider adapts to its native
 * shape: Anthropic wraps as `tools[].input_schema`, DeepSeek wraps as
 * `tools[].function.parameters`.
 */
export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema describing the structured output. */
  schema: Record<string, unknown>;
};

export type ToolUseParams = CompletionParams & {
  tool: ToolDefinition;
};

export type ToolUseResult = {
  toolName: string;
  /** Parsed JSON object — caller validates against its Zod schema. */
  input: unknown;
  inputTokens: number;
  outputTokens: number;
};

export interface AiProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  completion(params: CompletionParams): Promise<CompletionResult>;
  stream(params: CompletionParams): AsyncIterable<StreamChunk>;
  toolUse(params: ToolUseParams): Promise<ToolUseResult>;
}

/**
 * Errors thrown by providers should set `isRetryable` on retryable
 * conditions (5xx, network timeout, rate limit, transient overload) so
 * the fallback wrapper can decide whether to retry on the secondary
 * provider. 4xx schema/auth errors are NOT retryable — they'll fail
 * exactly the same way on the fallback.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderName,
    public readonly isRetryable: boolean,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
