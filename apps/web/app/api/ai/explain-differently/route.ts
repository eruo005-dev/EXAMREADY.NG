/**
 * POST /api/ai/explain-differently
 *
 * Re-explains a question's solution in one of four styles:
 *   - simpler       : plain English, junior-secondary register
 *   - with_analogy  : Nigerian everyday analogy
 *   - step_by_step  : numbered, max 6 steps, one sentence each (Sprint 6 NEW)
 *   - pidgin        : authentic Nigerian Pidgin (FEATURE-FLAGGED OFF
 *                     until human review — gated by PIDGIN_ENABLED env)
 *
 * Provider routing (Sprint 6):
 *   - All four levels → DeepSeek-V3 primary, OpenAI gpt-4o-mini fallback
 *   - With LOCAL_AI_ENABLED=true: simpler / with_analogy / step_by_step
 *     try the local server first (Pidgin is excluded — moat features
 *     don't get routed to anything but the canonical primary).
 *   - Pidgin still has no fallback — even when enabled, a primary
 *     failure surfaces 503 to the client rather than silently swap.
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
import { AI_MODELS, explainLevelToRoutingKey, resolveRouting } from '@/lib/ai/constants';
import {
  buildExplainUserMessage,
  EXPLAIN_SYSTEM_PROMPTS,
  PIDGIN_ENABLED,
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
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'user',
  rateLimit: 'bypass', // own tier-aware quota system below
  bodySchema: explainDifferentlyInputSchema,
})(async ({ parsed, user }) => {
  if (!user) throw new Error('user required');

  // Pidgin gate — feature-flagged off pending Nigerian-fluent reviewer
  // sign-off on output samples (see PIDGIN_SAMPLES.md). 404 with a
  // FEATURE_DISABLED code so the client can route the user toward the
  // other styles cleanly. The UI hides the option when
  // NEXT_PUBLIC_PIDGIN_ENABLED is unset, but a hostile client could
  // still send the request — this is the load-bearing gate.
  if (parsed.level === 'pidgin' && !PIDGIN_ENABLED()) {
    throw new ApiError(
      'FEATURE_DISABLED',
      'Pidgin explanations are not currently available. Try Simpler English, Step-by-step, or With an analogy.',
      404,
    );
  }

  const routingKey = explainLevelToRoutingKey(parsed.level);
  const featureRouting = AI_MODELS.explainDifferently[routingKey];
  const routing = resolveRouting(featureRouting);

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

  // ------------------------------------------------------------------
  // Sprint 7 Phase 5.2 — application-layer cache.
  //
  // Same (questionId, level) pair tends to be requested by many users
  // when a question goes viral; serving from Redis is ~$0 instead of
  // ~$0.0004 per call. Cache only NON-pidgin levels — pidgin output is
  // gated on review and we don't want to pin a sample that might fail
  // a future audit. TTL 7 days is conservative; we can tighten if a
  // model upgrade lands and outputs need to refresh.
  // ------------------------------------------------------------------
  const cache = getRedis();
  const cacheKey =
    parsed.level !== 'pidgin' ? `ai:explain:${parsed.questionId}:${parsed.level}` : null;
  if (cache && cacheKey) {
    try {
      const cached = await cache.get<string>(cacheKey);
      if (typeof cached === 'string' && cached.length > 0) {
        await logAiCall({
          userId: user.profile.id,
          feature: 'explain_differently',
          provider: 'deepseek',
          model: 'cache-hit',
          wasFallback: false,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: Date.now() - start,
          succeeded: true,
          outputText: cached,
        });
        return ok({
          explanation: cached,
          level: parsed.level,
          aiUsageLogId: null,
          cacheHit: true,
          remainingToday:
            quota.remainingToday === Number.MAX_SAFE_INTEGER
              ? null
              : Math.max(0, quota.remainingToday - 1),
        });
      }
    } catch {
      // Cache failure should never break the user-facing call.
    }
  }

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

    // Persist to cache (best-effort) so the next caller hits the
    // fast path. 7-day TTL aligns with DeepSeek's prompt-cache TTL —
    // refreshing both at the same cadence keeps cost projections stable.
    if (cache && cacheKey) {
      try {
        await cache.set(cacheKey, explanation, { ex: 7 * 24 * 3600 });
      } catch {
        // Cache write failure isn't user-facing; just skip.
      }
    }

    return ok({
      explanation,
      level: parsed.level,
      aiUsageLogId,
      cacheHit: false,
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
    // AND fallback failed.
    if (routing.fallback === null) {
      throw new ApiError(
        'BAD_GATEWAY',
        'Pidgin explanation is temporarily unavailable. Try Simpler English, Step-by-step, or With an analogy instead.',
        503,
      );
    }
    throw new ApiError('BAD_GATEWAY', 'AI service error. Try again.', 502);
  }
});
