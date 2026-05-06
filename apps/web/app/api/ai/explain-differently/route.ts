/**
 * POST /api/ai/explain-differently
 *
 * Re-explains a question's solution in one of three styles:
 *   - simpler          : plain English, junior-secondary register
 *   - with-analogy     : maps the concept onto a Nigerian everyday analogy
 *   - in-pidgin        : authentic Nigerian Pidgin English  ← the moat
 *
 * The original explanation is the source of truth — the model RESTATES,
 * never re-derives. This avoids the model second-guessing the original
 * and propagating errors.
 *
 * Quotas: free 10/day, basic 100/day, pro unlimited (see lib/ai/quota).
 * Rate-limit (throughput): 5/10s per user.
 */

import { options as optionsTable, questions } from '@examready/db/schema';
import { explainDifferentlyInputSchema } from '@examready/shared';
import { eq, inArray } from 'drizzle-orm';

import { AI_MODELS, getAnthropic, logAiCall } from '@/lib/ai/client';
import {
  buildExplainUserMessage,
  EXPLAIN_SYSTEM_PROMPTS,
} from '@/lib/ai/prompts/explain-differently';
import { checkAiQuota } from '@/lib/ai/quota';
import {
  ApiError,
  defineRoute,
  NotFoundError,
  ok,
  TierLimitExceededError,
} from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'user',
  rateLimit: 'bypass', // own tier-aware quota system below
  bodySchema: explainDifferentlyInputSchema,
})(async ({ parsed, user }) => {
  if (!user) throw new Error('user required');

  const anthropic = getAnthropic();
  if (!anthropic) {
    throw new ApiError(
      'BAD_GATEWAY',
      'AI features are not configured on this deployment.',
      503,
    );
  }

  // Quota check BEFORE the (much more expensive) DB lookup + Anthropic call.
  const quota = await checkAiQuota({
    userId: user.profile.id,
    tier: user.profile.subscriptionTier,
    feature: 'explain_differently',
  });
  if (!quota.ok) {
    if (quota.reason === 'rate_limited') {
      throw new ApiError('RATE_LIMITED', 'Slow down — try again in a moment.', 429, undefined, {
        retryAfterSeconds: quota.retryAfterSeconds,
      });
    }
    throw new TierLimitExceededError(
      `You've used today's ${quota.cap} AI re-explanations. Upgrade to Pro for unlimited.`,
      quota.nextAvailableAt,
    );
  }

  // Fetch the question + options (needed for the prompt).
  const [question] = await db
    .select({
      id: questions.id,
      stem: questions.stem,
      passage: questions.passage,
      explanation: questions.explanation,
      isActive: questions.isActive,
    })
    .from(questions)
    .where(eq(questions.id, parsed.questionId))
    .limit(1);
  if (!question || !question.isActive) throw new NotFoundError('Question not found');

  const opts = await db
    .select({
      label: optionsTable.label,
      content: optionsTable.content,
      isCorrect: optionsTable.isCorrect,
      sortOrder: optionsTable.sortOrder,
    })
    .from(optionsTable)
    .where(inArray(optionsTable.questionId, [parsed.questionId]))
    .orderBy(optionsTable.sortOrder);

  const userMessage = buildExplainUserMessage({
    questionStem: question.stem,
    passage: question.passage,
    options: opts.map(({ label, content, isCorrect }) => ({ label, content, isCorrect })),
    originalExplanation: question.explanation,
  });

  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let succeeded = false;
  let errorCode: string | undefined;

  try {
    const completion = await anthropic.messages.create({
      model: AI_MODELS.explainDifferently,
      max_tokens: 800,
      system: EXPLAIN_SYSTEM_PROMPTS[parsed.level],
      messages: [{ role: 'user', content: userMessage }],
    });

    inputTokens = completion.usage?.input_tokens ?? 0;
    outputTokens = completion.usage?.output_tokens ?? 0;

    // Extract text content. Anthropic returns an array of blocks; for our
    // simple system-prompt-only call, the first text block is the answer.
    const textBlock = completion.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new ApiError('BAD_GATEWAY', 'AI returned no text content.', 502);
    }

    succeeded = true;
    return ok({
      explanation: textBlock.text.trim(),
      level: parsed.level,
      remainingToday:
        quota.remainingToday === Number.MAX_SAFE_INTEGER ? null : Math.max(0, quota.remainingToday - 1),
    });
  } catch (err) {
    errorCode = err instanceof ApiError ? err.code : 'AI_ERROR';
    if (err instanceof ApiError) throw err;
    throw new ApiError('BAD_GATEWAY', 'AI service error. Try again.', 502);
  } finally {
    await logAiCall({
      userId: user.profile.id,
      feature: 'explain_differently',
      model: AI_MODELS.explainDifferently,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      succeeded,
      errorCode,
    });
  }
});
