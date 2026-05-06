/**
 * POST /api/admin/questions/:questionId/reject
 *
 * Removes an AI-generated question from the moderation queue. Hard-deletes
 * because:
 *   1. The question was never active, so no attempt_answers reference it.
 *   2. Soft-delete (is_active=false) is what the moderation queue itself
 *      filters ON — soft-deleting would leave the row in the queue.
 *
 * Refuses to act on human-authored questions (generated_by_model IS NULL)
 * or questions that have somehow accumulated attempt_answers — those
 * need the regular PATCH+is_active=false flow instead.
 */
import { attemptAnswers, options as optionsTable, questions } from '@examready/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';


import { ConflictError, defineRoute, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'admin',
})<{ questionId: string }>(async ({ params }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.questionId)) throw new NotFoundError('Question not found');

  // Look up the question and ensure it's eligible for hard-delete.
  const [q] = await db
    .select({
      id: questions.id,
      generatedByModel: questions.generatedByModel,
      isActive: questions.isActive,
    })
    .from(questions)
    .where(and(eq(questions.id, params.questionId), isNotNull(questions.generatedByModel)))
    .limit(1);
  if (!q) throw new NotFoundError('Question not found in moderation queue');

  // Defensive: if any attempt_answers reference this row, refuse to delete.
  const [refCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attemptAnswers)
    .where(eq(attemptAnswers.questionId, params.questionId));
  if ((refCount?.n ?? 0) > 0) {
    throw new ConflictError(
      'This question has been attempted by users — soft-delete via PATCH instead.',
    );
  }

  // Hard delete options + question. Order matters since options has a
  // logical FK relationship via question_id (no DB-level cascade).
  await db.transaction(async (tx) => {
    await tx.delete(optionsTable).where(eq(optionsTable.questionId, params.questionId));
    await tx.delete(questions).where(eq(questions.id, params.questionId));
  });

  return ok({ rejected: true, questionId: params.questionId });
});
