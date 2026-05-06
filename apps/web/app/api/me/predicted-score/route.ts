/**
 * GET /api/me/predicted-score?examId=<uuid>  (Sprint 6 — new moat)
 *
 * Computes a predicted exam score band from the user's last 90 days of
 * practice attempts. Pure data first — the optional AI interpretation
 * (1 DeepSeek call, cached 24h) is a soft layer on top.
 *
 * Algorithm (per the spec):
 *   1. Pull last 90 days of submitted attempts on this exam
 *   2. Compute per-subject accuracy weighted by topic frequency_score
 *   3. Compute trend (rolling 14 vs 90) → improving / plateauing / declining
 *   4. Map weighted overall accuracy → score band per exam slug
 *   5. (Optional) AI-write a 1-paragraph interpretation, cached 24h
 *
 * Refuses to predict when the user has fewer than 50 submitted answers
 * in the last 90 days — that's not enough signal. Returns
 * INSUFFICIENT_DATA so the UI can render a "take more questions" CTA.
 */
import {
  attemptAnswers,
  attempts,
  exams,
  questions,
  subjects as subjectsTable,
  topics,
} from '@examready/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { logAiCall } from '@/lib/ai/client';
import { AI_MODELS, resolveRouting } from '@/lib/ai/constants';
import { runWithFallback } from '@/lib/ai/providers';
import { ApiError, defineRoute, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';
import {
  bandForAccuracy,
  trendFromAccuracies,
  type ScoreBand,
  type TrendDirection,
} from '@/lib/predicted-score';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const MIN_SAMPLES = 50;
const CACHE_TTL_SECONDS = 24 * 60 * 60;

export const GET = defineRoute({ auth: 'user' })(async ({ req, user }) => {
  if (!user) throw new Error('user required');

  const examId = new URL(req.url).searchParams.get('examId');
  if (!examId) {
    throw new ApiError('VALIDATION_ERROR', 'examId query parameter required', 400);
  }

  const [exam] = await db
    .select({ id: exams.id, slug: exams.slug, name: exams.name })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);
  if (!exam) throw new NotFoundError('Exam not found');

  // Per-subject accuracy with topic-frequency weighting, last 90 days.
  type SubjectRow = {
    subjectSlug: string;
    subjectName: string;
    weightedCorrect: number;
    weightedTotal: number;
    sampleCount: number;
  };
  const subjectRows: SubjectRow[] = await db
    .select({
      subjectSlug: subjectsTable.slug,
      subjectName: subjectsTable.name,
      weightedCorrect: sql<number>`coalesce(sum(${topics.frequencyScore} * (case when ${attemptAnswers.isCorrect} then 1 else 0 end)), 0)::int`,
      weightedTotal: sql<number>`coalesce(sum(${topics.frequencyScore}), 0)::int`,
      sampleCount: sql<number>`count(*)::int`,
    })
    .from(attemptAnswers)
    .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
    .innerJoin(questions, eq(questions.id, attemptAnswers.questionId))
    .innerJoin(topics, eq(topics.id, questions.topicId))
    .innerJoin(subjectsTable, eq(subjectsTable.id, questions.subjectId))
    .where(
      and(
        eq(attempts.userId, user.profile.id),
        eq(attempts.examId, examId),
        isNotNull(attempts.submittedAt),
        sql`${attempts.submittedAt} >= now() - interval '90 days'`,
      ),
    )
    .groupBy(subjectsTable.slug, subjectsTable.name);

  const totalSamples = subjectRows.reduce((s, r) => s + r.sampleCount, 0);
  if (totalSamples < MIN_SAMPLES) {
    throw new ApiError(
      'INSUFFICIENT_DATA',
      `Take at least ${MIN_SAMPLES} questions on this exam to unlock predicted score (you have ${totalSamples}).`,
      400,
    );
  }

  // Rolling 14-day vs 90-day overall accuracy for the trend signal.
  const [trendRow] = await db
    .select({
      rolling14Correct: sql<number>`coalesce(sum(case when ${attempts.submittedAt} >= now() - interval '14 days' and ${attemptAnswers.isCorrect} then 1 else 0 end), 0)::int`,
      rolling14Total: sql<number>`coalesce(sum(case when ${attempts.submittedAt} >= now() - interval '14 days' then 1 else 0 end), 0)::int`,
      rolling90Correct: sql<number>`coalesce(sum(case when ${attemptAnswers.isCorrect} then 1 else 0 end), 0)::int`,
      rolling90Total: sql<number>`count(*)::int`,
    })
    .from(attemptAnswers)
    .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
    .where(
      and(
        eq(attempts.userId, user.profile.id),
        eq(attempts.examId, examId),
        isNotNull(attempts.submittedAt),
        sql`${attempts.submittedAt} >= now() - interval '90 days'`,
      ),
    );

  const rolling14 =
    trendRow && trendRow.rolling14Total > 0
      ? Math.round((trendRow.rolling14Correct / trendRow.rolling14Total) * 100)
      : 0;
  const rolling90 =
    trendRow && trendRow.rolling90Total > 0
      ? Math.round((trendRow.rolling90Correct / trendRow.rolling90Total) * 100)
      : 0;
  const trend: TrendDirection = trendFromAccuracies(rolling14, rolling90);

  // Weighted overall accuracy across subjects.
  const weightedCorrect = subjectRows.reduce((s, r) => s + r.weightedCorrect, 0);
  const weightedTotal = subjectRows.reduce((s, r) => s + r.weightedTotal, 0);
  const weightedAccuracy =
    weightedTotal > 0 ? Math.round((weightedCorrect / weightedTotal) * 100) : 0;

  const band: ScoreBand | null = bandForAccuracy(exam.slug, weightedAccuracy);

  // Per-subject breakdown for the UI (sorted weakest-first).
  const subjects = subjectRows
    .map((r) => ({
      subjectSlug: r.subjectSlug,
      subjectName: r.subjectName,
      accuracyPercent:
        r.weightedTotal > 0 ? Math.round((r.weightedCorrect / r.weightedTotal) * 100) : 0,
      sampleCount: r.sampleCount,
    }))
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent);

  // Optional AI interpretation cached for 24h per (user, exam).
  let interpretation: string | null = null;
  const redis = getRedis();
  const cacheKey = `predicted-score:interpretation:${user.profile.id}:${examId}`;
  if (redis) {
    interpretation = (await redis.get<string>(cacheKey)) ?? null;
  }

  if (!interpretation) {
    interpretation = await tryGenerateInterpretation({
      userId: user.profile.id,
      examName: exam.name,
      bandLabel: band?.bandLabel ?? 'unknown',
      weightedAccuracy,
      trend,
      weakestSubjects: subjects.slice(0, 3),
    });
    if (redis && interpretation) {
      await redis.set(cacheKey, interpretation, { ex: CACHE_TTL_SECONDS });
    }
  }

  return ok({
    examId,
    examName: exam.name,
    samples: totalSamples,
    weightedAccuracy,
    band: band ? { label: band.bandLabel, low: band.bandLow, high: band.bandHigh } : null,
    trend,
    rolling14DayAccuracy: rolling14,
    rolling90DayAccuracy: rolling90,
    subjects,
    interpretation,
  });
});

/**
 * AI interpretation — 1 short paragraph naming the weakest subject and
 * what improvement would lift the band. Skipped silently when DeepSeek
 * is unconfigured (the data part of the response is the moat anyway).
 */
async function tryGenerateInterpretation(args: {
  userId: string;
  examName: string;
  bandLabel: string;
  weightedAccuracy: number;
  trend: TrendDirection;
  weakestSubjects: Array<{ subjectName: string; accuracyPercent: number }>;
}): Promise<string | null> {
  const routing = resolveRouting(AI_MODELS.studyPlan);
  // Use the chat model for this — interpretation is short prose, doesn't
  // need the reasoner. Override the routing's model deliberately.
  const model = 'deepseek-chat';

  const weakBlock = args.weakestSubjects
    .map((s) => `- ${s.subjectName}: ${s.accuracyPercent}%`)
    .join('\n');

  const userMsg = `Student is preparing for ${args.examName}.

Practice accuracy: ${args.weightedAccuracy}% (weighted by topic importance).
Trend: ${args.trend} (last 14 days vs last 90).
Predicted band: ${args.bandLabel}.

Weakest 3 subjects:
${weakBlock}

Write ONE paragraph (3-4 sentences max) interpreting this for the student. Direct Nigerian English voice. Name the weakest subject and what specific improvement would lift the band. No fluff, no encouragement boilerplate.`;

  const start = Date.now();
  try {
    const outcome = await runWithFallback(
      { provider: routing.primary.provider, model },
      routing.fallback
        ? { provider: routing.fallback.provider, model: routing.fallback.model }
        : null,
      (provider, m) =>
        provider.completion({
          model: m,
          maxTokens: 200,
          systemPrompt:
            'You write very short student-facing performance interpretations. No markdown, no lists, no preamble.',
          messages: [{ role: 'user', content: userMsg }],
        }),
    );

    await logAiCall({
      userId: args.userId,
      feature: 'study_plan', // counts toward study-plan-class budget
      provider: outcome.provider,
      model: outcome.model,
      wasFallback: outcome.wasFallback,
      inputTokens: outcome.result.inputTokens,
      outputTokens: outcome.result.outputTokens,
      durationMs: Date.now() - start,
      succeeded: true,
    });

    return outcome.result.text.trim();
  } catch {
    return null; // soft-fail; UI handles missing interpretation
  }
}
