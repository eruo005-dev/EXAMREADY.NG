/**
 * POST /api/ai/tutor/chat
 *
 * Streaming chat with Ready AI. Returns text/plain (chunked) so the
 * frontend can append chunks as they arrive without SSE parsing.
 *
 * Provider routing (Sprint 5): Claude Sonnet 4.6 primary, DeepSeek
 * fallback. Tutor stays on Claude because multi-turn reasoning + the
 * Nigerian-English register tuning are the parts where quality matters
 * most. DeepSeek catches the rare Anthropic outage so the chat keeps
 * working — but the user sees a "(Switched to backup model)" banner if
 * fallback ever fires (TODO when the chat UI lands).
 *
 * Context-aware: if `questionId` is provided, the handler fetches the
 * question + the user's last 3 wrong attempts on its topic and folds
 * them into the first user-turn message.
 *
 * Quotas: free 5/day, basic 50/day, pro unlimited.
 *
 * Streaming format: text/plain with chunked transfer. Each chunk is a
 * UTF-8 fragment of the assistant's response. No JSON wrapping — the
 * frontend appends to a buffer as bytes arrive. On error, the response
 * ends abruptly; the client surfaces a "connection lost, try again"
 * message.
 *
 * Streaming + fallback: if the PRIMARY stream fails BEFORE any text
 * has been written to the response, we transparently fall back to the
 * secondary provider. If the primary fails MID-STREAM we just close
 * the connection — restarting from the secondary would emit a second
 * partial response which is worse UX than a "try again" prompt.
 */
import {
  attemptAnswers,
  attempts,
  options as optionsTable,
  questions,
  topics,
} from '@examready/db/schema';
import { tutorChatInputSchema } from '@examready/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { logAiCall } from '@/lib/ai/client';
import { AI_MODELS } from '@/lib/ai/constants';
import { buildTutorContextMessage, TUTOR_SYSTEM_PROMPT } from '@/lib/ai/prompts/tutor';
import {
  getProvider,
  ProviderError,
  type ChatMessage,
  type ProviderName,
  type StreamChunk,
} from '@/lib/ai/providers';
import { checkAiQuota } from '@/lib/ai/quota';
import { getAuthedUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { redactPii } from '@/lib/observability/pii';

export const dynamic = 'force-dynamic';

/**
 * This route uses raw Response streaming instead of defineRoute() because
 * defineRoute is built around { ok, data } JSON envelopes. Streaming
 * needs the response body to be a ReadableStream of text. We replicate
 * the auth + quota gates inline.
 */
export async function POST(req: NextRequest): Promise<Response> {
  let user;
  try {
    user = await getAuthedUser(req);
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Sign in to chat with Ready AI.' },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = tutorChatInputSchema.parse(body);
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid chat request.' },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const routing = AI_MODELS.tutor;
  const primaryConfigured = getProvider(routing.primary.provider).isConfigured();
  const fallbackConfigured =
    routing.fallback !== null && getProvider(routing.fallback.provider).isConfigured();
  if (!primaryConfigured && !fallbackConfigured) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'BAD_GATEWAY',
          message: 'AI features are not configured on this deployment.',
        },
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const quota = await checkAiQuota({
    userId: user.profile.id,
    tier: user.profile.subscriptionTier,
    feature: 'tutor_chat',
  });
  if (!quota.ok) {
    if (quota.reason === 'rate_limited') {
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Slow down — try again in a moment.',
            retryAfterSeconds: quota.retryAfterSeconds,
          },
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(quota.retryAfterSeconds),
          },
        },
      );
    }
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'TIER_LIMIT_EXCEEDED',
          message: `You've used today's ${quota.cap} Ready AI questions. Upgrade to Pro for unlimited.`,
          nextAvailableAt: quota.nextAvailableAt,
        },
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Build the context message from the question + past mistakes (if any).
  let contextMessage = '';
  if (parsed.questionId) {
    const [q] = await db
      .select({
        stem: questions.stem,
        explanation: questions.explanation,
        topicId: questions.topicId,
        topicName: topics.name,
      })
      .from(questions)
      .innerJoin(topics, eq(topics.id, questions.topicId))
      .where(eq(questions.id, parsed.questionId))
      .limit(1);

    if (q) {
      const recent = await db
        .select({
          stem: questions.stem,
          selectedOptionIds: attemptAnswers.selectedOptionIds,
          submittedAt: attempts.submittedAt,
        })
        .from(attemptAnswers)
        .innerJoin(questions, eq(questions.id, attemptAnswers.questionId))
        .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
        .where(
          and(
            eq(attempts.userId, user.profile.id),
            eq(questions.topicId, q.topicId),
            eq(attemptAnswers.isCorrect, false),
          ),
        )
        .orderBy(desc(attempts.submittedAt))
        .limit(3);

      const recentMistakes = await Promise.all(
        recent.map(async (r) => {
          const allOpts = await db
            .select({
              label: optionsTable.label,
              isCorrect: optionsTable.isCorrect,
            })
            .from(optionsTable)
            .where(eq(optionsTable.questionId, parsed.questionId!));
          const correctLabel = allOpts.find((o) => o.isCorrect)?.label ?? '?';
          const theirLabel =
            r.selectedOptionIds && r.selectedOptionIds.length > 0
              ? (allOpts.find((o) => o.label === r.selectedOptionIds?.[0])?.label ?? '?')
              : '?';
          const daysAgo = r.submittedAt
            ? Math.floor((Date.now() - r.submittedAt.getTime()) / (24 * 60 * 60 * 1000))
            : 0;
          return {
            stem: r.stem,
            theirAnswer: theirLabel,
            correctAnswer: correctLabel,
            daysAgo,
          };
        }),
      );

      contextMessage = buildTutorContextMessage({
        questionStem: q.stem,
        questionExplanation: q.explanation,
        topicName: q.topicName,
        recentMistakes,
      });
    }
  }

  // Compose the messages array. Synthetic context goes in as a user/
  // assistant pair so the system prompt stays cacheable across users.
  const messages: ChatMessage[] = contextMessage
    ? [
        { role: 'user', content: contextMessage },
        { role: 'assistant', content: 'Got it. Ready when you are.' },
        ...parsed.messages,
      ]
    : parsed.messages;

  // Try primary first; if it errors BEFORE we send anything to the client,
  // we can switch to the fallback. Anthropic's `.stream()` validates and
  // sends headers eagerly, so init failures (auth, model not found, 5xx
  // on session start) surface here.
  const start = Date.now();
  const userId = user.profile.id;
  const encoder = new TextEncoder();

  const tryProvider = (pm: {
    provider: ProviderName;
    model: string;
  }): AsyncIterable<StreamChunk> | null => {
    const p = getProvider(pm.provider);
    if (!p.isConfigured()) return null;
    return p.stream({
      model: pm.model,
      maxTokens: 1024,
      systemPrompt: TUTOR_SYSTEM_PROMPT,
      messages,
    });
  };

  let usedProvider: ProviderName = routing.primary.provider;
  let usedModel = routing.primary.model;
  let wasFallback = false;
  let iter: AsyncIterable<StreamChunk> | null = null;

  try {
    iter = tryProvider(routing.primary);
    if (iter === null) {
      // Primary not configured — fall through to fallback below.
      throw new ProviderError(
        `${routing.primary.provider} not configured`,
        routing.primary.provider,
        true,
      );
    }
  } catch (err) {
    if (routing.fallback && (!(err instanceof ProviderError) || err.isRetryable)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ai/tutor] ${routing.primary.provider} stream init failed; falling back`,
        redactPii({ err: String(err) }),
      );
      const fb = tryProvider(routing.fallback);
      if (fb !== null) {
        iter = fb;
        usedProvider = routing.fallback.provider;
        usedModel = routing.fallback.model;
        wasFallback = true;
      }
    }
    if (iter === null) {
      // eslint-disable-next-line no-console
      console.error(
        '[ai/tutor] all providers failed at stream init:',
        redactPii({ err: String(err) }),
      );
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'BAD_GATEWAY', message: 'AI service error.' } }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  let inputTokens = 0;
  let outputTokens = 0;
  const stream = iter;
  const finalProvider = usedProvider;
  const finalModel = usedModel;
  const finalWasFallback = wasFallback;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.kind === 'text') {
            controller.enqueue(encoder.encode(chunk.text));
          } else if (chunk.kind === 'usage') {
            if (typeof chunk.inputTokens === 'number') inputTokens = chunk.inputTokens;
            if (typeof chunk.outputTokens === 'number') outputTokens = chunk.outputTokens;
          }
        }
        controller.close();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ai/tutor] stream error:', redactPii({ err: String(err) }));
        controller.error(err);
      } finally {
        // Telemetry happens regardless of success — counts toward the daily cap.
        void logAiCall({
          userId,
          feature: 'tutor_chat',
          provider: finalProvider,
          model: finalModel,
          wasFallback: finalWasFallback,
          inputTokens,
          outputTokens,
          durationMs: Date.now() - start,
          succeeded: outputTokens > 0,
        });
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-AI-Provider': finalProvider,
      'X-AI-Was-Fallback': finalWasFallback ? '1' : '0',
    },
  });
}
