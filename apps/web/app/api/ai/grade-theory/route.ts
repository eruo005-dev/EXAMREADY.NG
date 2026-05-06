/**
 * POST /api/ai/grade-theory  (AI Examiner — Sprint 6 new moat)
 *
 * Grades a student's free-text answer against a theory question's
 * stored marking guide. Returns per-criterion marks + overall feedback +
 * 3 concrete suggested improvements.
 *
 * Routing: DeepSeek-R1 (reasoner) primary, OpenAI gpt-4o-mini fallback.
 * Reasoning model is the right choice — it has to PARSE the student
 * answer, COMPARE it against each marking guide point, and DECIDE
 * partial credit. Chat-class models tend to over-credit on keywords.
 *
 * Storage: every grading writes to theory_attempts so admins can
 * spot-check via /admin/ai-quality-review and we have analytics for
 * "which criteria do students miss most?"
 *
 * Quotas: free 2/day, basic 5/day, pro 20/day. Throughput 1/min
 * (the call takes ~15s; 1/min is plenty).
 */
import { exams, questions, theoryAttempts } from '@examready/db/schema';
import { aiGradeTheoryInputSchema } from '@examready/shared';
import { eq } from 'drizzle-orm';

import { logAiCall } from '@/lib/ai/client';
import { AI_MODELS, resolveRouting } from '@/lib/ai/constants';
import {
  buildGradeTheoryUserMessage,
  GRADE_THEORY_SYSTEM_PROMPT,
  GRADE_THEORY_TOOL,
  gradeTheoryResultSchema,
} from '@/lib/ai/prompts/grade-theory';
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
  bodySchema: aiGradeTheoryInputSchema,
})(async ({ parsed, user }) => {
  if (!user) throw new Error('user required');

  const routing = resolveRouting(AI_MODELS.aiExaminer);
  const primaryConfigured = getProvider(routing.primary.provider).isConfigured();
  const fallbackConfigured =
    routing.fallback !== null && getProvider(routing.fallback.provider).isConfigured();
  if (!primaryConfigured && !fallbackConfigured) {
    throw new ApiError('BAD_GATEWAY', 'AI features are not configured on this deployment.', 503);
  }

  const quota = await checkAiQuota({
    userId: user.profile.id,
    tier: user.profile.subscriptionTier,
    feature: 'ai_examiner',
  });
  if (!quota.ok) {
    if (quota.reason === 'rate_limited') {
      throw new ApiError(
        'RATE_LIMITED',
        'AI Examiner is busy — try again in a minute.',
        429,
        undefined,
        { retryAfterSeconds: quota.retryAfterSeconds },
      );
    }
    throw new TierLimitExceededError(
      `You've used today's ${quota.cap} AI Examiner gradings. Upgrade to Pro for ${20}/day.`,
      quota.nextAvailableAt,
    );
  }

  // Fetch question + verify it's a theory question on the requested exam.
  const [question] = await db
    .select({
      id: questions.id,
      stem: questions.stem,
      questionType: questions.questionType,
      examId: questions.examId,
      markingGuide: questions.markingGuide,
      maxMarks: questions.maxMarks,
      sampleExcellentAnswer: questions.sampleExcellentAnswer,
      isActive: questions.isActive,
    })
    .from(questions)
    .where(eq(questions.id, parsed.questionId))
    .limit(1);

  if (!question || !question.isActive) throw new NotFoundError('Question not found');
  if (question.questionType !== 'theory') {
    throw new ApiError(
      'VALIDATION_ERROR',
      'AI Examiner only grades theory questions. Use the multiple-choice grader for MCQ.',
      400,
    );
  }
  if (question.examId !== parsed.examId) {
    throw new ApiError('VALIDATION_ERROR', 'Question does not belong to the specified exam.', 400);
  }
  if (!question.maxMarks || question.markingGuide.length === 0) {
    throw new ApiError(
      'CONFLICT',
      'This question is missing its marking guide and cannot be auto-graded yet.',
      409,
    );
  }

  // Resolve the exam name for the prompt context.
  const [examRow] = await db
    .select({ name: exams.name, subjectName: exams.name })
    .from(exams)
    .where(eq(exams.id, parsed.examId))
    .limit(1);

  const userMessage = buildGradeTheoryUserMessage({
    questionStem: question.stem,
    examName: examRow?.name ?? 'Unknown',
    subjectName: 'Theory question', // We don't denormalise subject onto questions for this call; admin can fix later.
    markingGuide: question.markingGuide,
    maxMarks: question.maxMarks,
    sampleExcellentAnswer: question.sampleExcellentAnswer,
    userAnswer: parsed.userAnswer,
  });

  const start = Date.now();
  let usedProvider = routing.primary.provider;
  let usedModel = routing.primary.model;
  let wasFallback = false;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const outcome = await runWithFallback(routing.primary, routing.fallback, (provider, model) =>
      provider.toolUse({
        model,
        maxTokens: 4096,
        systemPrompt: GRADE_THEORY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        tool: GRADE_THEORY_TOOL,
      }),
    );

    inputTokens = outcome.result.inputTokens;
    outputTokens = outcome.result.outputTokens;
    usedProvider = outcome.provider;
    usedModel = outcome.model;
    wasFallback = outcome.wasFallback;

    const validated = gradeTheoryResultSchema.safeParse(outcome.result.input);
    if (!validated.success) {
      // eslint-disable-next-line no-console
      console.error('[ai/grade-theory] schema validation failed:', validated.error.flatten());
      throw new ApiError('BAD_GATEWAY', 'AI returned grading in an unexpected format.', 502);
    }

    // Sanity check: total marks shouldn't exceed maxMarks.
    if (validated.data.totalMarks > validated.data.maxMarks) {
      throw new ApiError(
        'BAD_GATEWAY',
        'AI grading internal inconsistency (total > max). Try again.',
        502,
      );
    }

    // Persist the grading.
    const [saved] = await db
      .insert(theoryAttempts)
      .values({
        userId: user.profile.id,
        questionId: question.id,
        examId: parsed.examId,
        userAnswer: parsed.userAnswer,
        aiResponse: validated.data,
        provider: usedProvider,
        model: usedModel,
        totalMarks: Math.round(validated.data.totalMarks),
        maxMarks: validated.data.maxMarks,
      })
      .returning({ id: theoryAttempts.id });

    await logAiCall({
      userId: user.profile.id,
      feature: 'ai_examiner',
      provider: usedProvider,
      model: usedModel,
      wasFallback,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      succeeded: true,
    });

    return ok({
      theoryAttemptId: saved?.id,
      grade: validated.data,
      remainingToday:
        quota.remainingToday === Number.MAX_SAFE_INTEGER
          ? null
          : Math.max(0, quota.remainingToday - 1),
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      usedProvider = err.provider;
    }
    await logAiCall({
      userId: user.profile.id,
      feature: 'ai_examiner',
      provider: usedProvider,
      model: usedModel,
      wasFallback,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      succeeded: false,
      errorCode: 'GRADE_FAILED',
    });
    if (err instanceof ApiError) throw err;
    throw new ApiError('BAD_GATEWAY', 'AI Examiner is unavailable. Try again.', 502);
  }
});
