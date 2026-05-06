/**
 * GET /api/attempts/:attemptId
 *
 * Returns the same shape as POST /:id/submit. Used by the results page
 * on reload (so the user doesn't lose their breakdown if they refresh).
 *
 * Verifies attempt ownership. Returns 404 if not yours or not submitted —
 * we don't expose the existence of in-progress attempts via GET.
 */
import { attemptAnswers, attempts, options, questions, topics } from '@examready/db/schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';


import { defineRoute, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'user' })<{ attemptId: string }>(async ({ params, user }) => {
  if (!user) throw new Error('user required');
  if (!/^[0-9a-f-]{36}$/i.test(params.attemptId)) {
    throw new NotFoundError('Attempt not found');
  }

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.id, params.attemptId),
        eq(attempts.userId, user.profile.id),
        isNotNull(attempts.submittedAt),
      ),
    )
    .limit(1);
  if (!attempt) throw new NotFoundError('Attempt not found');

  const answers = await db
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, attempt.id));
  const questionIds = answers.map((a) => a.questionId);

  const [questionRows, optionRows, topicRows] = await Promise.all([
    db
      .select({ id: questions.id, explanation: questions.explanation, topicId: questions.topicId })
      .from(questions)
      .where(inArray(questions.id, questionIds)),
    db
      .select({ id: options.id, questionId: options.questionId, isCorrect: options.isCorrect })
      .from(options)
      .where(inArray(options.questionId, questionIds)),
    db.select().from(topics),
  ]);

  const correctByQ = new Map<string, string[]>();
  optionRows.forEach((o) => {
    if (!o.isCorrect) return;
    if (!correctByQ.has(o.questionId)) correctByQ.set(o.questionId, []);
    correctByQ.get(o.questionId)!.push(o.id);
  });

  const topicNameById = new Map(topicRows.map((t) => [t.id, t.name]));
  const questionById = new Map(questionRows.map((q) => [q.id, q]));

  const breakdown = answers.map((a) => {
    const q = questionById.get(a.questionId)!;
    return {
      questionId: a.questionId,
      isCorrect: a.isCorrect ?? false,
      selectedOptionIds: a.selectedOptionIds,
      correctOptionIds: correctByQ.get(a.questionId) ?? [],
      explanation: q.explanation,
      topicId: q.topicId,
      topicName: topicNameById.get(q.topicId) ?? 'Unknown',
    };
  });

  const timeSpentSeconds = attempt.submittedAt
    ? Math.floor((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000)
    : 0;

  return ok({
    attemptId: attempt.id,
    correctCount: attempt.correctCount ?? 0,
    totalQuestions: attempt.totalQuestions,
    accuracyPercent: Number(attempt.accuracyPercent ?? 0),
    timeSpentSeconds,
    submittedAt: attempt.submittedAt!.toISOString(),
    breakdown,
  });
});
