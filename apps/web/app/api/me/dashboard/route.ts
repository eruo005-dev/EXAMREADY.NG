/**
 * GET /api/me/dashboard
 *
 * Aggregates the dashboard payload in a single endpoint to avoid
 * waterfall requests on a slow Nigerian network. Cached per-user 60s
 * in Redis (skipped if Redis is unavailable).
 *
 * Includes:
 * - User basics + streak + Ready Points balance
 * - Target exams with days-until countdown
 * - 30-day stats (questions answered, accuracy, study time)
 * - Top 5 weak topics (heatmap query — see CHECKPOINT 2 plan analysis)
 * - 5 most recent submitted attempts
 * - Single most recent in-progress attempt (for "resume" widget)
 */
import { and, desc, eq, isNotNull, isNull, sql, sum } from 'drizzle-orm';

import {
  attemptAnswers,
  attempts,
  exams as examsTable,
  questions,
  readyPointsLog,
  subjects as subjectsTable,
  targetExams,
  topics as topicsTable,
} from '@examready/db/schema';

import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 60;

export const GET = defineRoute({ auth: 'user' })(async ({ user }) => {
  if (!user) throw new Error('user required');
  const userId = user.profile.id;
  const cacheKey = `dashboard:${userId}`;

  const redis = getRedis();
  if (redis) {
    const cached = await redis.get<string>(cacheKey);
    if (cached) {
      try {
        return ok(JSON.parse(cached));
      } catch {
        // Bad cache entry — fall through.
      }
    }
  }

  // Run aggregation queries in parallel.
  const [
    pointsBalance,
    targetExamRows,
    stats30dRow,
    weakTopicRows,
    recentAttemptRows,
    inProgressRow,
  ] = await Promise.all([
    db
      .select({ total: sum(readyPointsLog.points) })
      .from(readyPointsLog)
      .where(eq(readyPointsLog.userId, userId)),
    db
      .select({
        examId: targetExams.examId,
        examName: examsTable.name,
        examDate: targetExams.examDate,
      })
      .from(targetExams)
      .innerJoin(examsTable, eq(examsTable.id, targetExams.examId))
      .where(eq(targetExams.userId, userId)),
    db
      .select({
        attemptsCount: sql<number>`count(distinct ${attempts.id})::int`,
        questionsAnswered: sql<number>`count(${attemptAnswers.id})::int`,
        correct: sql<number>`sum(case when ${attemptAnswers.isCorrect} then 1 else 0 end)::int`,
        studyTime: sql<number>`coalesce(sum(${attemptAnswers.timeSpentSeconds}), 0)::int`,
      })
      .from(attempts)
      .leftJoin(attemptAnswers, eq(attemptAnswers.attemptId, attempts.id))
      .where(
        and(
          eq(attempts.userId, userId),
          isNotNull(attempts.submittedAt),
          sql`${attempts.submittedAt} >= now() - interval '30 days'`,
        ),
      ),
    /**
     * Heatmap query — confirmed query plan in CHECKPOINT 2 follow-ups.
     * Hits the partial index attempts(user_id, submitted_at DESC) WHERE
     * submitted_at IS NOT NULL, then nested loop into attempt_answers via
     * (attempt_id, question_id) UNIQUE.
     */
    db
      .select({
        topicId: questions.topicId,
        topicName: topicsTable.name,
        subjectName: subjectsTable.name,
        total: sql<number>`count(*)::int`,
        correct: sql<number>`sum(case when ${attemptAnswers.isCorrect} then 1 else 0 end)::int`,
      })
      .from(attemptAnswers)
      .innerJoin(attempts, eq(attempts.id, attemptAnswers.attemptId))
      .innerJoin(questions, eq(questions.id, attemptAnswers.questionId))
      .innerJoin(topicsTable, eq(topicsTable.id, questions.topicId))
      .innerJoin(subjectsTable, eq(subjectsTable.id, questions.subjectId))
      .where(
        and(
          eq(attempts.userId, userId),
          isNotNull(attempts.submittedAt),
          sql`${attempts.submittedAt} >= now() - interval '30 days'`,
        ),
      )
      .groupBy(questions.topicId, topicsTable.name, subjectsTable.name)
      .orderBy(sql`(sum(case when ${attemptAnswers.isCorrect} then 1 else 0 end)::float / count(*)) asc`)
      .limit(5),
    db
      .select({
        attemptId: attempts.id,
        mode: attempts.mode,
        examName: examsTable.name,
        correctCount: attempts.correctCount,
        totalQuestions: attempts.totalQuestions,
        submittedAt: attempts.submittedAt,
      })
      .from(attempts)
      .innerJoin(examsTable, eq(examsTable.id, attempts.examId))
      .where(and(eq(attempts.userId, userId), isNotNull(attempts.submittedAt)))
      .orderBy(desc(attempts.submittedAt))
      .limit(5),
    db
      .select({
        attemptId: attempts.id,
        mode: attempts.mode,
        totalQuestions: attempts.totalQuestions,
        startedAt: attempts.startedAt,
        answered: sql<number>`(
          select count(*)::int from ${attemptAnswers}
          where ${attemptAnswers.attemptId} = ${attempts.id} and ${attemptAnswers.answeredAt} is not null
        )`,
      })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), isNull(attempts.submittedAt)))
      .orderBy(desc(attempts.startedAt))
      .limit(1),
  ]);

  const stats = stats30dRow[0] ?? { attemptsCount: 0, questionsAnswered: 0, correct: 0, studyTime: 0 };
  const accuracyPercent =
    stats.questionsAnswered > 0 ? (stats.correct / stats.questionsAnswered) * 100 : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const payload = {
    user: {
      id: user.profile.id,
      fullName: user.profile.fullName,
      subscriptionTier: user.profile.subscriptionTier,
      subscriptionExpiresAt: user.profile.subscriptionExpiresAt?.toISOString() ?? null,
      streakDays: 0, // Computed by streak-rollover cron later. Sprint 0 placeholder.
      readyPointsBalance: Number(pointsBalance[0]?.total ?? 0),
    },
    targetExams: targetExamRows.map((r) => {
      const daysUntil = r.examDate
        ? Math.ceil((new Date(r.examDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return {
        examId: r.examId,
        examName: r.examName,
        examDate: r.examDate,
        daysUntil,
      };
    }),
    stats30d: {
      questionsAnswered: stats.questionsAnswered,
      accuracyPercent: Math.round(accuracyPercent * 10) / 10,
      studyTimeSeconds: stats.studyTime,
      attemptsCount: stats.attemptsCount,
    },
    weakTopics: weakTopicRows.map((r) => ({
      topicId: r.topicId,
      topicName: r.topicName,
      subjectName: r.subjectName,
      accuracyPercent: r.total > 0 ? Math.round((r.correct / r.total) * 1000) / 10 : 0,
      attempts: r.total,
    })),
    recentAttempts: recentAttemptRows.map((r) => ({
      attemptId: r.attemptId,
      mode: r.mode,
      examName: r.examName,
      correctCount: r.correctCount ?? 0,
      totalQuestions: r.totalQuestions,
      submittedAt: r.submittedAt!.toISOString(),
    })),
    inProgressAttempt: inProgressRow[0]
      ? {
          attemptId: inProgressRow[0].attemptId,
          mode: inProgressRow[0].mode,
          questionsRemaining:
            inProgressRow[0].totalQuestions - Number(inProgressRow[0].answered),
          startedAt: inProgressRow[0].startedAt.toISOString(),
        }
      : null,
  };

  if (redis) {
    await redis.set(cacheKey, JSON.stringify({ data: payload }), { ex: CACHE_TTL_SECONDS });
  }

  return ok(payload);
});
