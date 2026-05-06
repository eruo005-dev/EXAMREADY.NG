/**
 * OpenAI provider — emergency fallback only (Sprint 6).
 *
 * Used as the runWithFallback secondary for every feature when DeepSeek
 * returns a retryable error (5xx / 408 / 429 / network). Model is fixed
 * at gpt-4o-mini — the cheapest reasonable OpenAI model that still
 * supports function calling for our tool_use code path.
 *
 * NOT routed as a primary anywhere in production. If you find yourself
 * tempted to make OpenAI primary for some feature, consider:
 *   1. Why is DeepSeek not enough?
 *   2. Quality A/B testing against DeepSeek (use /admin/ai-quality-review).
 *   3. Updating constants.ts AI_MODELS routing AND lib/ai/README.md.
 *
 * The official OpenAI SDK is the same `openai` npm package the DeepSeek
 * adapter already uses (DeepSeek's API is OpenAI-compatible) — only the
 * baseURL differs.
 */
import OpenAI from 'openai';

import {
  type AiProvider,
  type CompletionParams,
  type CompletionResult,
  ProviderError,
  type StreamChunk,
  type ToolUseParams,
  type ToolUseResult,
} from './types';

let cached: OpenAI | null | undefined;

function client(): OpenAI | null {
  if (cached !== undefined) return cached;
  const key = process.env.OPENAI_API_KEY;
  cached = key ? new OpenAI({ apiKey: key }) : null;
  return cached;
}

function isRetryableOpenAIError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
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
    `openai ${op} failed: ${String((err as Error)?.message ?? err)}`,
    'openai',
    isRetryableOpenAIError(err),
    err,
  );
}

function toOpenAIMessages(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

export const openaiProvider: AiProvider = {
  name: 'openai',

  isConfigured() {
    return client() !== null;
  },

  async completion(params: CompletionParams): Promise<CompletionResult> {
    const c = client();
    if (!c) throw new ProviderError('OpenAI not configured', 'openai', false);

    try {
      const resp = await c.chat.completions.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: toOpenAIMessages(params.systemPrompt, params.messages),
      });
      const text = resp.choices[0]?.message?.content;
      if (typeof text !== 'string' || text.length === 0) {
        throw new ProviderError('OpenAI returned no text content', 'openai', false);
      }
      return {
        text,
        inputTokens: resp.usage?.prompt_tokens ?? 0,
        outputTokens: resp.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      wrap(err, 'completion');
    }
  },

  async *stream(params: CompletionParams): AsyncIterable<StreamChunk> {
    const c = client();
    if (!c) throw new ProviderError('OpenAI not configured', 'openai', false);

    let iter;
    try {
      iter = await c.chat.completions.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: toOpenAIMessages(params.systemPrompt, params.messages),
        stream: true,
        stream_options: { include_usage: true },
      });
    } catch (err) {
      wrap(err, 'stream-init');
    }

    try {
      for await (const chunk of iter) {
        const delta = chunk.choices[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          yield { kind: 'text', text: delta };
        }
        if (chunk.usage) {
          yield {
            kind: 'usage',
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }
    } catch (err) {
      wrap(err, 'stream');
    }
  },

  async toolUse(params: ToolUseParams): Promise<ToolUseResult> {
    const c = client();
    if (!c) throw new ProviderError('OpenAI not configured', 'openai', false);

    try {
      const resp = await c.chat.completions.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: toOpenAIMessages(params.systemPrompt, params.messages),
        tools: [
          {
            type: 'function',
            function: {
              name: params.tool.name,
              description: params.tool.description,
              parameters: params.tool.schema as Record<string, unknown>,
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: { name: params.tool.name },
        },
      });

      const call = resp.choices[0]?.message?.tool_calls?.[0];
      if (!call || call.type !== 'function') {
        throw new ProviderError('OpenAI returned no tool call', 'openai', false);
      }
      let parsedInput: unknown;
      try {
        parsedInput = JSON.parse(call.function.arguments);
      } catch (err) {
        throw new ProviderError(
          `OpenAI tool arguments not valid JSON: ${String(err)}`,
          'openai',
          false,
          err,
        );
      }
      return {
        toolName: call.function.name,
        input: parsedInput,
        inputTokens: resp.usage?.prompt_tokens ?? 0,
        outputTokens: resp.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      wrap(err, 'toolUse');
    }
  },
};
