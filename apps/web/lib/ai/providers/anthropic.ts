// Disabled at Sprint 6 — kept for future re-introduction.
//
// Anthropic was the original AI provider (Sprints 3-4) and the fallback
// for DeepSeek (Sprint 5). Sprint 6 migrated all features to DeepSeek
// with OpenAI gpt-4o-mini as the emergency fallback. The Anthropic
// adapter is intentionally retained as commented-out code so a future
// sprint can re-enable it (e.g. for the Pidgin moat once DeepSeek's
// Pidgin output is verified, or as a third-line fallback).
//
// To re-enable:
//   1. Uncomment the implementation block below.
//   2. Add `anthropic: anthropicProvider` to PROVIDERS in providers/index.ts.
//   3. Add ANTHROPIC_API_KEY back to the active section of .env.example.
//   4. Update AI_MODELS in lib/ai/constants.ts to route the relevant feature.
//   5. Update lib/ai/README.md routing table.
//
// The stub below keeps the symbol exported (so existing imports don't
// break) but reports `isConfigured() === false` and throws on every call.
// That makes it inert — runWithFallback() will skip it as a primary and
// any direct caller will get a clear "not configured" ProviderError.

import {
  type AiProvider,
  type CompletionParams,
  type CompletionResult,
  ProviderError,
  type StreamChunk,
  type ToolUseParams,
  type ToolUseResult,
} from './types';

const DISABLED_MESSAGE =
  'Anthropic provider is disabled at Sprint 6. See lib/ai/providers/anthropic.ts for re-enable instructions.';

export const anthropicProvider: AiProvider = {
  name: 'anthropic',
  isConfigured: () => false,
  async completion(_params: CompletionParams): Promise<CompletionResult> {
    throw new ProviderError(DISABLED_MESSAGE, 'anthropic', false);
  },
  // eslint-disable-next-line require-yield
  async *stream(_params: CompletionParams): AsyncIterable<StreamChunk> {
    throw new ProviderError(DISABLED_MESSAGE, 'anthropic', false);
  },
  async toolUse(_params: ToolUseParams): Promise<ToolUseResult> {
    throw new ProviderError(DISABLED_MESSAGE, 'anthropic', false);
  },
};

/* === Original Anthropic implementation — disabled at Sprint 6 ===

import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | null | undefined;

function client(): Anthropic | null {
  if (cached !== undefined) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  cached = key ? new Anthropic({ apiKey: key }) : null;
  return cached;
}

function isRetryableAnthropicError(err: unknown): boolean {
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number') {
    if (status >= 500) return true;
    if (status === 408 || status === 429) return true;
    return false;
  }
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

export const anthropicProviderImpl: AiProvider = {
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

=== end disabled Anthropic implementation === */
