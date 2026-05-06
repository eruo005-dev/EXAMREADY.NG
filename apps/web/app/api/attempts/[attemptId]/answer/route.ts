/**
 * PATCH /api/attempts/:attemptId/answer
 *
 * Saves a single answer. Critical invariant: NEVER computes or returns
 * is_correct. Correctness is frozen during POST /:id/submit only — no
 * mid-attempt leak through any path.
 *
 * Rate limit bumped to 1200/min user-level for fast-paced mock CBTs
 * (multi-section exams produce sustained ~10/sec writes).
 */

import { attemptAnswers, attempts } from '@examready/db/schema';
import { submitAnswerSchema } from '@examready/shared';
import { and, eq } from 'drizzle-orm';

import {
  ConflictError,
  defineRoute,
  NotFoundError,
  ok,
} from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  auth: 'user',
  rateLimit: 'answer',
  bodySchema: submitAnswerSchema,
})<{ attemptId: string }>(async ({ params, parsed, user }) => {
  if (!user) throw new Error('user required');
  if (!/^[0-9a-f-]{36}$/i.test(params.attemptId)) {
    throw new NotFoundError('Attempt not found');
  }

  // Verify ownership and that the attempt isn't already submitted.
  const [attempt] = await db
    .select({ submittedAt: attempts.submittedAt })
    .from(attempts)
    .where(and(eq(attempts.id, params.attemptId), eq(attempts.userId, user.profile.id)))
    .limit(1);
  if (!attempt) throw new NotFoundError('Attempt not found');
  if (attempt.submittedAt) {
    throw new ConflictError('Attempt already submitted — answers are frozen');
  }

  // Update by composite (attempt_id, question_id). The empty rows were
  // created when the attempt started, so this is always an UPDATE.
  await db
    .update(attemptAnswers)
    .set({
      selectedOptionIds: parsed.selectedOptionIds,
      textAnswer: parsed.textAnswer,
      timeSpentSeconds: parsed.timeSpentSeconds,
      flagged: parsed.flagged ?? false,
      answeredAt: new Date(),
      // is_correct stays NULL — DO NOT compute it here.
    })
    .where(
      and(
        eq(attemptAnswers.attemptId, params.attemptId),
        eq(attemptAnswers.questionId, parsed.questionId),
      ),
    );

  return ok({ saved: true });
});
