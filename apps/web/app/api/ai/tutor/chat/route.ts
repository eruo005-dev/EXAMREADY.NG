/**
 * POST /api/ai/tutor/chat
 *
 * Streaming chat with Ready AI. Returns text/event-stream so the
 * frontend can render incremental tokens.
 *
 * Context-aware: if `questionId` is provided, the handler fetches the
 * question + the user's last 3 wrong attempts on its topic and folds
 * them into the first user-turn message. The student doesn't see this
 * synthetic context message; they just see the responses informed by it.
 *
 * Quotas: free 5/day, basic 50/day, pro unlimited.
 *
 * Streaming format: text/plain with chunked transfer. Each chunk is a
 * UTF-8 fragment of the assistant's response. No JSON wrapping — the
 * frontend appends to a buffer as bytes arrive. On error, the response
 * ends abruptly; the client surfaces a "connection lost, try again"
 * message. We deliberately don't switch to SSE for this — the simpler
 * format works fine for plain-text generation and reduces parsing risk.
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


import { AI_MODELS, getAnthropic, logAiCall } from '@/lib/ai/client';
import { buildTutorContextMessage, TUTOR_SYSTEM_PROMPT } from '@/lib/ai/prompts/tutor';
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
    return new Response(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Sign in to chat with Ready AI.' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = tutorChatInputSchema.parse(body);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid chat request.' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anthropic = getAnthropic();
  if (!anthropic) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'BAD_GATEWAY', message: 'AI features are not configured on this deployment.' } }),
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
        JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: 'Slow down — try again in a moment.', retryAfterSeconds: quota.retryAfterSeconds } }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(quota.retryAfterSeconds) } },
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
      // Pull the user's last 3 wrong attempts on this topic.
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

      // For each wrong attempt, look up the option labels they picked vs the correct ones.
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
              ? allOpts.find((o) => o.label === r.selectedOptionIds?.[0])?.label ?? '?'
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

  // Compose the messages array. If there's a synthetic context message,
  // prepend it as a "user" turn — Anthropic doesn't have a "context" role,
  // and putting it in the system prompt would prevent prompt caching.
  const messages = contextMessage
    ? [
        { role: 'user' as const, content: contextMessage },
        { role: 'assistant' as const, content: 'Got it. Ready when you are.' },
        ...parsed.messages,
      ]
    : parsed.messages;

  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  // Stream from Anthropic. Per their SDK, .stream() returns a MessageStream
  // we can iterate with .on('text', ...) or async-iterate the raw events.
  let stream;
  try {
    stream = anthropic.messages.stream({
      model: AI_MODELS.tutorChat,
      max_tokens: 1024,
      system: TUTOR_SYSTEM_PROMPT,
      messages,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai/tutor] stream init failed:', redactPii({ err: String(err) }));
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'BAD_GATEWAY', message: 'AI service error.' } }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();
  const userId = user.profile.id;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          } else if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens;
          } else if (event.type === 'message_start' && event.message.usage) {
            inputTokens = event.message.usage.input_tokens;
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
          model: AI_MODELS.tutorChat,
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
    },
  });
}
