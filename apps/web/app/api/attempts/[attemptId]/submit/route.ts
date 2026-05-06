/**
 * POST /api/attempts/:attemptId/submit
 *
 * THE only endpoint that computes is_correct. Runs in a transaction:
 * 1. Lock the attempt row (FOR UPDATE) to prevent double submit
 * 2. Load all answers + their question's correct options
 * 3. Compute is_correct for each (jsonb array compare for mcq_*)
 * 4. UPDATE attempt_answers with is_correct
 * 5. UPDATE attempts.correct_count + accuracy_percent + submitted_at
 * 6. Award Ready Points
 *
 * Idempotent: re-submitting returns the same result; we re-read state
 * if submittedAt already set.
 */
import {
  attemptAnswers,
  attempts,
  options,
  questions,
  readyPointsLog,
  topics,
} from '@examready/db/schema';
import { and, eq, inArray } from 'drizzle-orm';


import {
  ConflictError,
  defineRoute,
  NotFoundError,
  ok,
} from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function arraysEqualUnordered(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export const POST = defineRoute({
  auth: 'user',
})<{ attemptId: string }>(async ({ params, user }) => {
  if (!user) throw new Error('user required');
  if (!/^[0-9a-f-]{36}$/i.test(params.attemptId)) {
    throw new NotFoundError('Attempt not found');
  }

  const result = await db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, params.attemptId), eq(attempts.userId, user.profile.id)))
      .for('update');
    if (!attempt) throw new NotFoundError('Attempt not found');

    // Idempotency — if already submitted, just return the existing result.
    if (attempt.submittedAt) {
      return { attempt, freshSubmit: false };
    }

    const answers = await tx
      .select()
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, attempt.id));

    if (answers.length === 0) {
      throw new ConflictError('No answers recorded — cannot submit');
    }

    const questionIds = answers.map((a) => a.questionId);
    const correctOptionsRows = await tx
      .select({
        questionId: options.questionId,
        id: options.id,
      })
      .from(options)
      .where(and(inArray(options.questionId, questionIds), eq(options.isCorrect, true)));

    const correctByQuestion = new Map<string, string[]>();
    correctOptionsRows.forEach((o) => {
      if (!correctByQuestion.has(o.questionId)) correctByQuestion.set(o.questionId, []);
      correctByQuestion.get(o.questionId)!.push(o.id);
    });

    let correctCount = 0;
    for (const a of answers) {
      const correctIds = correctByQuestion.get(a.questionId) ?? [];
      const selected = a.selectedOptionIds ?? [];
      const isCorrect = arraysEqualUnordered(selected, correctIds);
      if (isCorrect) correctCount += 1;
      await tx
        .update(attemptAnswers)
        .set({ isCorrect })
        .where(eq(attemptAnswers.id, a.id));
    }

    const totalQuestions = answers.length;
    const accuracyPercent = (correctCount / totalQuestions) * 100;
    const submittedAt = new Date();

    const [updated] = await tx
      .update(attempts)
      .set({
        correctCount,
        accuracyPercent: accuracyPercent.toFixed(2),
        submittedAt,
      })
      .where(eq(attempts.id, attempt.id))
      .returning();

    // Award Ready Points: 1 per correct + 5 bonus for completion.
    await tx.insert(readyPointsLog).values({
      userId: user.profile.id,
      points: correctCount + 5,
      reason: 'attempt_submit',
      metadata: { attemptId: attempt.id, mode: attempt.mode },
    });

    return { attempt: updated!, freshSubmit: true };
  });

  // Build the breakdown response (correct option ids, explanations, topic names).
  const fullAnswers = await db
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, result.attempt.id));

  const questionIds = fullAnswers.map((a) => a.questionId);

  const [questionRows, optionRows, topicRows] = await Promise.all([
    db
      .select({
        id: questions.id,
        explanation: questions.explanation,
        topicId: questions.topicId,
      })
      .from(questions)
      .where(inArray(questions.id, questionIds)),
    db
      .select({
        id: options.id,
        questionId: options.questionId,
        isCorrect: options.isCorrect,
      })
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

  const breakdown = fullAnswers.map((a) => {
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

  const submittedAt = result.attempt.submittedAt!;
  const timeSpentSeconds = Math.floor(
    (submittedAt.getTime() - result.attempt.startedAt.getTime()) / 1000,
  );

  return ok({
    attemptId: result.attempt.id,
    correctCount: result.attempt.correctCount ?? 0,
    totalQuestions: result.attempt.totalQuestions,
    accuracyPercent: Number(result.attempt.accuracyPercent ?? 0),
    timeSpentSeconds,
    submittedAt: submittedAt.toISOString(),
    breakdown,
  });
});
