/**
 * Local-inference provider — opt-in self-hosted fallback (Sprint 6).
 *
 * Disabled by default. Enable with LOCAL_AI_ENABLED=true and set
 * LOCAL_AI_BASE_URL to a server exposing the OpenAI Chat Completions API
 * (Ollama, vLLM, llama.cpp server, LM Studio, etc.).
 *
 * Routing rule (enforced in constants.ts, not here):
 *   - Critical features (tutor, aiExaminer, studyPlan) ALWAYS go to
 *     DeepSeek regardless of LOCAL_AI_ENABLED.
 *   - Non-critical features (explain-differently, questionGen) try local
 *     FIRST when LOCAL_AI_ENABLED=true; DeepSeek is the fallback.
 *
 * Why this default? Local inference is great for personal dev cost
 * savings and for sensitive data, but production stability depends on
 * machine uptime, model availability, and network latency from Vercel
 * to the local machine. At launch DAU, DeepSeek is fast and cheap
 * enough that complicating the deploy isn't worth it.
 *
 * Suggested models (see lib/ai/README.md):
 *  - Qwen2.5-32B-Coder-Instruct for question generation (24GB VRAM)
 *  - Llama-3.3-70B-Instruct Q4 for explanations (32GB+ recommended)
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
  if (process.env.LOCAL_AI_ENABLED !== 'true') {
    cached = null;
    return null;
  }
  const baseURL = process.env.LOCAL_AI_BASE_URL;
  if (!baseURL) {
    cached = null;
    return null;
  }
  // Most local servers don't require an API key; we send a dummy one
  // because the OpenAI SDK requires a non-empty value.
  cached = new OpenAI({ apiKey: 'local-no-key', baseURL });
  return cached;
}

function isRetryableLocalError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number') {
    if (status >= 500) return true;
    if (status === 408 || status === 429) return true;
    return false;
  }
  // Connection refused / timeout — local box might be off. Retryable
  // (the runWithFallback wrapper will route to DeepSeek).
  return true;
}

function wrap(err: unknown, op: string): never {
  if (err instanceof ProviderError) throw err;
  throw new ProviderError(
    `local ${op} failed: ${String((err as Error)?.message ?? err)}`,
    'local',
    isRetryableLocalError(err),
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

export const localProvider: AiProvider = {
  name: 'local',

  isConfigured() {
    return client() !== null;
  },

  async completion(params: CompletionParams): Promise<CompletionResult> {
    const c = client();
    if (!c) throw new ProviderError('Local AI not configured', 'local', false);
    try {
      const resp = await c.chat.completions.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: toOpenAIMessages(params.systemPrompt, params.messages),
      });
      const text = resp.choices[0]?.message?.content;
      if (typeof text !== 'string' || text.length === 0) {
        throw new ProviderError('Local AI returned no text content', 'local', false);
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
    if (!c) throw new ProviderError('Local AI not configured', 'local', false);
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
    if (!c) throw new ProviderError('Local AI not configured', 'local', false);
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
        throw new ProviderError('Local AI returned no tool call', 'local', false);
      }
      let parsedInput: unknown;
      try {
        parsedInput = JSON.parse(call.function.arguments);
      } catch (err) {
        throw new ProviderError(
          `Local AI tool arguments not valid JSON: ${String(err)}`,
          'local',
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
