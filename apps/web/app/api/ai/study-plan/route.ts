/**
 * POST /api/ai/study-plan
 *
 * Generates a personalised week-by-week study plan via the provider
 * abstraction with structured output (tool_use ↔ function calling).
 * Saves the plan to study_plans, marks any prior plan for the same
 * (user, exam) as is_current=false.
 *
 * Provider routing (Sprint 5): DeepSeek primary, Claude Haiku fallback.
 * Both providers run the same JSON schema — Anthropic via tool_use,
 * DeepSeek via OpenAI-style function calling. The provider adapter
 * normalises the output so caller-side Zod validation stays identical.
 *
 * Quotas: free 1/day, basic 5/day, pro unlimited. Throughput 2/min.
 *
 * The weak-topics list is computed from the dashboard heatmap query
 * (CHECKPOINT 2 plan) — last-30-day attempt accuracy grouped by topic.
 */

import {
  attemptAnswers,
  attempts,
  exams,
  questions,
  studyPlans,
  topics,
} from '@examready/db/schema';
import { studyPlanInputSchema } from '@examready/shared';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { logAiCall } from '@/lib/ai/client';
import { AI_MODELS } from '@/lib/ai/constants';
import {
  buildStudyPlanUserMessage,
  studyPlanSchema,
  STUDY_PLAN_SYSTEM_PROMPT,
  STUDY_PLAN_TOOL,
} from '@/lib/ai/prompts/study-plan';
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
  rateLimit: 'bypass',
  bodySchema: studyPlanInputSchema,
})(async ({ parsed, user }) => {
  if (!user) throw new Error('user required');

  const routing = AI_MODELS.studyPlan;
  const primaryConfigured = getProvider(routing.primary.provider).isConfigured();
  const fallbackConfigured =
    routing.fallback !== null && getProvider(routing.fallback.provider).isConfigured();
  if (!primaryConfigured && !fallbackConfigured) {
    throw new ApiError('BAD_GATEWAY', 'AI features are not configured on this deployment.', 503);
  }

  const quota = await checkAiQuota({
    userId: user.profile.id,
    tier: user.profile.subscriptionTier,
    feature: 'study_plan',
  });
  if (!quota.ok) {
    if (quota.reason === 'rate_limited') {
      throw new ApiError('RATE_LIMITED', 'Slow down — try again in a moment.', 429, undefined, {
        retryAfterSeconds: quota.retryAfterSeconds,
      });
    }
    throw new TierLimitExceededError(
      `You've used today's ${quota.cap} study-plan generation${quota.cap === 1 ? '' : 's'}. Upgrade to Pro for unlimited.`,
      quota.nextAvailableAt,
    );
  }

  const [exam] = await db
    .select({ id: exams.id, name: exams.name })
    .from(exams)
    .where(eq(exams.id, parsed.examId))
    .limit(1);
  if (!exam) throw new NotFoundError('Exam not found');

  type WeakRow = { slug: string; name: string; accuracyPercent: number };
  const weakTopicRows: WeakRow[] = (
    await db
      .select({
        topicSlug: topics.slug,
        topicName: topics.name,
        total: sql<number>`count(*)::int`,
        correct: sql<number>`sum(case when ${attemptAnswers.isCorrect} then 1 else 0 end)::int`,
      })
      .from(attemptAnswers)
      .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
      .innerJoin(questions, eq(questions.id, attemptAnswers.questionId))
      .innerJoin(topics, eq(topics.id, questions.topicId))
      .where(
        and(
          eq(attempts.userId, user.profile.id),
          eq(attempts.examId, parsed.examId),
          isNotNull(attempts.submittedAt),
          sql`${attempts.submittedAt} >= now() - interval '30 days'`,
        ),
      )
      .groupBy(topics.slug, topics.name)
      .orderBy(
        sql`(sum(case when ${attemptAnswers.isCorrect} then 1 else 0 end)::float / count(*)) asc`,
      )
      .limit(8)
  )
    .filter((r) => r.total >= 3)
    .map<WeakRow>((r) => ({
      slug: r.topicSlug,
      name: r.topicName,
      accuracyPercent: Math.round((r.correct / r.total) * 100),
    }));

  const userMessage = buildStudyPlanUserMessage({
    examName: exam.name,
    examDate: parsed.examDate,
    hoursPerWeek: parsed.hoursPerWeek,
    weakTopics: weakTopicRows,
    todayIso: new Date().toISOString().slice(0, 10),
  });

  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let succeeded = false;
  let errorCode: string | undefined;
  let usedProvider = routing.primary.provider;
  let usedModel = routing.primary.model;
  let wasFallback = false;

  try {
    const outcome = await runWithFallback(routing.primary, routing.fallback, (provider, model) =>
      provider.toolUse({
        model,
        maxTokens: 8192,
        systemPrompt: STUDY_PLAN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        tool: STUDY_PLAN_TOOL,
      }),
    );

    inputTokens = outcome.result.inputTokens;
    outputTokens = outcome.result.outputTokens;
    usedProvider = outcome.provider;
    usedModel = outcome.model;
    wasFallback = outcome.wasFallback;

    const validated = studyPlanSchema.safeParse(outcome.result.input);
    if (!validated.success) {
      // eslint-disable-next-line no-console
      console.error('[ai/study-plan] schema validation failed:', validated.error.flatten());
      throw new ApiError('BAD_GATEWAY', 'AI returned a plan in an unexpected format.', 502);
    }

    // Persist: mark prior plans non-current, insert new one as current.
    const saved = await db.transaction(async (tx) => {
      await tx
        .update(studyPlans)
        .set({ isCurrent: false })
        .where(
          and(
            eq(studyPlans.userId, user.profile.id),
            eq(studyPlans.examId, parsed.examId),
            eq(studyPlans.isCurrent, true),
          ),
        );

      const [inserted] = await tx
        .insert(studyPlans)
        .values({
          userId: user.profile.id,
          examId: parsed.examId,
          examDate: parsed.examDate,
          hoursPerWeek: parsed.hoursPerWeek,
          weakTopics: weakTopicRows.map((t) => t.slug),
          plan: validated.data,
          generationInput: {
            examName: exam.name,
            weakTopicSummary: weakTopicRows,
            requestedAt: new Date().toISOString(),
            provider: usedProvider,
            model: usedModel,
            wasFallback,
          },
          generatedByModel: usedModel,
          isCurrent: true,
        })
        .returning();

      return inserted;
    });

    if (!saved) throw new ApiError('INTERNAL_ERROR', 'Failed to persist study plan.', 500);
    succeeded = true;

    return ok({
      studyPlanId: saved.id,
      plan: validated.data,
      remainingToday:
        quota.remainingToday === Number.MAX_SAFE_INTEGER
          ? null
          : Math.max(0, quota.remainingToday - 1),
    });
  } catch (err) {
    errorCode = err instanceof ApiError ? err.code : 'AI_ERROR';
    if (err instanceof ProviderError) {
      usedProvider = err.provider;
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError('BAD_GATEWAY', 'AI service error. Try again.', 502);
  } finally {
    await logAiCall({
      userId: user.profile.id,
      feature: 'study_plan',
      provider: usedProvider,
      model: usedModel,
      wasFallback,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      succeeded,
      errorCode,
    });
  }
});

export const GET = defineRoute({ auth: 'user' })(async ({ user }) => {
  if (!user) throw new Error('user required');

  const [current] = await db
    .select()
    .from(studyPlans)
    .where(and(eq(studyPlans.userId, user.profile.id), eq(studyPlans.isCurrent, true)))
    .orderBy(desc(studyPlans.createdAt))
    .limit(1);

  return ok({ plan: current ?? null });
});
