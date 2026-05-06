/**
 * DeepSeek provider — DeepSeek's API is OpenAI-compatible, so we use the
 * official `openai` SDK pointed at https://api.deepseek.com/v1.
 *
 * Used in production for the high-volume, lower-stakes features where the
 * cost win matters more than the last 5% of quality:
 *  - explain-differently (simpler + with-analogy levels — NOT pidgin)
 *  - study-plan generation
 *  - admin question generation (human-reviewed anyway)
 *
 * NEVER routed for tutor chat or pidgin explain-differently. Those stay
 * on Claude. See lib/ai/README.md for the routing rationale.
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

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

let cached: OpenAI | null | undefined;

function client(): OpenAI | null {
  if (cached !== undefined) return cached;
  const key = process.env.DEEPSEEK_API_KEY;
  cached = key ? new OpenAI({ apiKey: key, baseURL: DEEPSEEK_BASE_URL }) : null;
  return cached;
}

function isRetryableDeepSeekError(err: unknown): boolean {
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
    `deepseek ${op} failed: ${String((err as Error)?.message ?? err)}`,
    'deepseek',
    isRetryableDeepSeekError(err),
    err,
  );
}

/**
 * Map our ChatMessage[] (user/assistant only) plus a top-level system
 * prompt into OpenAI's flat `[{role: 'system'|'user'|'assistant'}, ...]`
 * messages array.
 */
function toOpenAIMessages(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

export const deepseekProvider: AiProvider = {
  name: 'deepseek',

  isConfigured() {
    return client() !== null;
  },

  async completion(params: CompletionParams): Promise<CompletionResult> {
    const c = client();
    if (!c) throw new ProviderError('DeepSeek not configured', 'deepseek', false);

    try {
      const resp = await c.chat.completions.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: toOpenAIMessages(params.systemPrompt, params.messages),
      });

      const text = resp.choices[0]?.message?.content;
      if (typeof text !== 'string' || text.length === 0) {
        throw new ProviderError('DeepSeek returned no text content', 'deepseek', false);
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
    if (!c) throw new ProviderError('DeepSeek not configured', 'deepseek', false);

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
    if (!c) throw new ProviderError('DeepSeek not configured', 'deepseek', false);

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
        throw new ProviderError('DeepSeek returned no tool call', 'deepseek', false);
      }

      // OpenAI/DeepSeek return arguments as a JSON string. Anthropic
      // returns a parsed object. Normalise here so callers always see
      // an object on `input`.
      let parsedInput: unknown;
      try {
        parsedInput = JSON.parse(call.function.arguments);
      } catch (err) {
        throw new ProviderError(
          `DeepSeek tool arguments not valid JSON: ${String(err)}`,
          'deepseek',
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
