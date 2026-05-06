/**
 * POST /api/ai/study-plan
 *
 * Generates a personalised week-by-week study plan via Claude with
 * structured output (tool_use). Saves the plan to study_plans, marks
 * any prior plan for the same (user, exam) as is_current=false.
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

import { AI_MODELS, getAnthropic, logAiCall } from '@/lib/ai/client';
import {
  buildStudyPlanUserMessage,
  studyPlanSchema,
  STUDY_PLAN_SYSTEM_PROMPT,
  STUDY_PLAN_TOOL,
} from '@/lib/ai/prompts/study-plan';
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

  const anthropic = getAnthropic();
  if (!anthropic) {
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

  // Compute weak topics: same query shape as the dashboard heatmap, capped
  // at the worst 8 topics (more than that and the prompt becomes unwieldy).
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
    .filter((r) => r.total >= 3) // need at least 3 attempts to call something "weak"
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

  try {
    const completion = await anthropic.messages.create({
      model: AI_MODELS.studyPlan,
      max_tokens: 8192,
      system: STUDY_PLAN_SYSTEM_PROMPT,
      tools: [STUDY_PLAN_TOOL],
      tool_choice: { type: 'tool', name: 'output_study_plan' },
      messages: [{ role: 'user', content: userMessage }],
    });

    inputTokens = completion.usage?.input_tokens ?? 0;
    outputTokens = completion.usage?.output_tokens ?? 0;

    // Find the tool_use block. tool_choice forces it but defensive coding.
    const toolUseBlock = completion.content.find((b) => b.type === 'tool_use');
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      throw new ApiError('BAD_GATEWAY', 'AI did not return a structured plan.', 502);
    }

    const validated = studyPlanSchema.safeParse(toolUseBlock.input);
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
          },
          generatedByModel: AI_MODELS.studyPlan,
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
        quota.remainingToday === Number.MAX_SAFE_INTEGER ? null : Math.max(0, quota.remainingToday - 1),
    });
  } catch (err) {
    errorCode = err instanceof ApiError ? err.code : 'AI_ERROR';
    if (err instanceof ApiError) throw err;
    throw new ApiError('BAD_GATEWAY', 'AI service error. Try again.', 502);
  } finally {
    await logAiCall({
      userId: user.profile.id,
      feature: 'study_plan',
      model: AI_MODELS.studyPlan,
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
