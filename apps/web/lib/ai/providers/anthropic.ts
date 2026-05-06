/**
 * Anthropic provider — wraps the @anthropic-ai/sdk Messages API behind
 * the AiProvider interface so call sites can swap providers without
 * caring which one's running.
 *
 * Used in production for:
 *  - Tutor chat (Sonnet 4.6) — quality matters most for the multi-turn case
 *  - Pidgin explain-differently (Haiku 4.5) — Pidgin is the moat, never
 *    silently fall back to DeepSeek (DeepSeek's Pidgin is unverified)
 *  - Fallback for everything else when DeepSeek is down (Haiku to keep
 *    cost in check)
 */
import Anthropic from '@anthropic-ai/sdk';

import {
  type AiProvider,
  type CompletionParams,
  type CompletionResult,
  ProviderError,
  type StreamChunk,
  type ToolUseParams,
  type ToolUseResult,
} from './types';

let cached: Anthropic | null | undefined;

function client(): Anthropic | null {
  if (cached !== undefined) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  cached = key ? new Anthropic({ apiKey: key }) : null;
  return cached;
}

/**
 * Anthropic SDK errors carry a `status` field. Treat 5xx / 408 / 429
 * as retryable (fallback worthwhile); 4xx schema/auth as terminal.
 */
function isRetryableAnthropicError(err: unknown): boolean {
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number') {
    if (status >= 500) return true;
    if (status === 408 || status === 429) return true;
    return false;
  }
  // Network-level error (no status) — assume retryable.
  return true;
}

function wrap(err: unknown, op: string): never {
  if (err instanceof ProviderError) throw err;
  throw new ProviderError(
    `anthropic ${op} failed: ${String((err as Error)?.message ?? err)}`,
    'anthropic',
    isRetryableAnthropicError(err),
    err,
  );
}

export const anthropicProvider: AiProvider = {
  name: 'anthropic',

  isConfigured() {
    return client() !== null;
  },

  async completion(params: CompletionParams): Promise<CompletionResult> {
    const c = client();
    if (!c) throw new ProviderError('Anthropic not configured', 'anthropic', false);

    try {
      const resp = await c.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.systemPrompt,
        temperature: params.temperature,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const textBlock = resp.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new ProviderError('Anthropic returned no text block', 'anthropic', false);
      }
      return {
        text: textBlock.text,
        inputTokens: resp.usage?.input_tokens ?? 0,
        outputTokens: resp.usage?.output_tokens ?? 0,
      };
    } catch (err) {
      wrap(err, 'completion');
    }
  },

  async *stream(params: CompletionParams): AsyncIterable<StreamChunk> {
    const c = client();
    if (!c) throw new ProviderError('Anthropic not configured', 'anthropic', false);

    let iter;
    try {
      iter = c.messages.stream({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.systemPrompt,
        temperature: params.temperature,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      });
    } catch (err) {
      wrap(err, 'stream-init');
    }

    try {
      for await (const event of iter) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { kind: 'text', text: event.delta.text };
        } else if (event.type === 'message_start' && event.message.usage) {
          yield { kind: 'usage', inputTokens: event.message.usage.input_tokens };
        } else if (event.type === 'message_delta' && event.usage) {
          yield { kind: 'usage', outputTokens: event.usage.output_tokens };
        }
      }
    } catch (err) {
      wrap(err, 'stream');
    }
  },

  async toolUse(params: ToolUseParams): Promise<ToolUseResult> {
    const c = client();
    if (!c) throw new ProviderError('Anthropic not configured', 'anthropic', false);

    try {
      const resp = await c.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.systemPrompt,
        temperature: params.temperature,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: [
          {
            name: params.tool.name,
            description: params.tool.description,
            input_schema: params.tool.schema as Anthropic.Messages.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: params.tool.name },
      });

      const block = resp.content.find((b) => b.type === 'tool_use');
      if (!block || block.type !== 'tool_use') {
        throw new ProviderError('Anthropic returned no tool_use block', 'anthropic', false);
      }
      return {
        toolName: block.name,
        input: block.input,
        inputTokens: resp.usage?.input_tokens ?? 0,
        outputTokens: resp.usage?.output_tokens ?? 0,
      };
    } catch (err) {
      wrap(err, 'toolUse');
    }
  },
};
