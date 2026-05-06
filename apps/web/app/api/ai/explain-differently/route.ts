/**
 * POST /api/ai/explain-differently
 *
 * Re-explains a question's solution in one of three styles:
 *   - simpler          : plain English, junior-secondary register
 *   - with-analogy     : maps the concept onto a Nigerian everyday analogy
 *   - in-pidgin        : authentic Nigerian Pidgin English  ← the moat
 *
 * Provider routing (Sprint 5):
 *   - simpler / with-analogy → DeepSeek primary, Claude Haiku 4.5 fallback
 *   - in-pidgin              → Claude Haiku 4.5 primary, NO fallback
 *     (DeepSeek's Pidgin is unverified — silently swapping providers
 *     would degrade the moat without anyone noticing)
 *
 * The original explanation is the source of truth — the model RESTATES,
 * never re-derives. This avoids the model second-guessing the original
 * and propagating errors.
 *
 * Quotas: free 10/day, basic 100/day, pro unlimited (see lib/ai/quota).
 */

import { options as optionsTable, questions } from '@examready/db/schema';
import { explainDifferentlyInputSchema } from '@examready/shared';
import { eq, inArray } from 'drizzle-orm';

import { logAiCall } from '@/lib/ai/client';
import { AI_MODELS, explainLevelToRoutingKey } from '@/lib/ai/constants';
import {
  buildExplainUserMessage,
  EXPLAIN_SYSTEM_PROMPTS,
} from '@/lib/ai/prompts/explain-differently';
import { getProvider, ProviderError, runWithFallback } from '@/lib/ai/providers';
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

  const routingKey = explainLevelToRoutingKey(parsed.level);
  const routing = AI_MODELS.explainDifferently[routingKey];

  // Verify the primary provider is configured. If not, AND there's no
  // configured fallback either, we have to refuse the call up front.
  const primaryConfigured = getProvider(routing.primary.provider).isConfigured();
  const fallbackConfigured =
    routing.fallback !== null && getProvider(routing.fallback.provider).isConfigured();
  if (!primaryConfigured && !fallbackConfigured) {
    throw new ApiError('BAD_GATEWAY', 'AI features are not configured on this deployment.', 503);
  }

  // Quota check BEFORE the (much more expensive) DB lookup + provider call.
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

  try {
    const outcome = await runWithFallback(routing.primary, routing.fallback, (provider, model) =>
      provider.completion({
        model,
        maxTokens: 800,
        systemPrompt: EXPLAIN_SYSTEM_PROMPTS[parsed.level],
        messages: [{ role: 'user', content: userMessage }],
      }),
    );

    const explanation = outcome.result.text.trim();
    if (explanation.length === 0) {
      await logAiCall({
        userId: user.profile.id,
        feature: 'explain_differently',
        provider: outcome.provider,
        model: outcome.model,
        wasFallback: outcome.wasFallback,
        inputTokens: outcome.result.inputTokens,
        outputTokens: outcome.result.outputTokens,
        durationMs: Date.now() - start,
        succeeded: false,
        errorCode: 'EMPTY_TEXT',
      });
      throw new ApiError('BAD_GATEWAY', 'AI returned no text content.', 502);
    }

    // Log + capture the row id so the response can include it. The
    // frontend uses aiUsageLogId to attach thumbs-up/down feedback.
    const aiUsageLogId = await logAiCall({
      userId: user.profile.id,
      feature: 'explain_differently',
      provider: outcome.provider,
      model: outcome.model,
      wasFallback: outcome.wasFallback,
      inputTokens: outcome.result.inputTokens,
      outputTokens: outcome.result.outputTokens,
      durationMs: Date.now() - start,
      succeeded: true,
      outputText: explanation,
    });

    return ok({
      explanation,
      level: parsed.level,
      aiUsageLogId,
      remainingToday:
        quota.remainingToday === Number.MAX_SAFE_INTEGER
          ? null
          : Math.max(0, quota.remainingToday - 1),
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;

    // Determine which provider/model the error came from. ProviderError
    // carries it; otherwise blame the primary (most likely culprit).
    const failedProvider = err instanceof ProviderError ? err.provider : routing.primary.provider;
    const failedModel = routing.primary.model;
    await logAiCall({
      userId: user.profile.id,
      feature: 'explain_differently',
      provider: failedProvider,
      model: failedModel,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      succeeded: false,
      errorCode: 'AI_ERROR',
    });

    // Pidgin path with no fallback: surface as 503 so the UI can suggest
    // a different style. Other paths reach here only when both primary
    // AND fallback failed — same 502 we returned before the abstraction.
    if (routing.fallback === null) {
      throw new ApiError(
        'BAD_GATEWAY',
        'Pidgin explanation is temporarily unavailable. Try Simpler English or With an analogy instead.',
        503,
      );
    }
    throw new ApiError('BAD_GATEWAY', 'AI service error. Try again.', 502);
  }
});
