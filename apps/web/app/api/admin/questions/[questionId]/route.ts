/**
 * GET    /api/admin/questions/:questionId  — full detail incl. options
 * PATCH  /api/admin/questions/:questionId  — partial update (atomic option replacement if options array is given)
 * DELETE /api/admin/questions/:questionId  — soft-delete via is_active=false (never hard-delete; attempt_answers FK)
 */

import { options as optionsTable, questions } from '@examready/db/schema';
import { questionUpdateInputSchema } from '@examready/shared';
import { asc, eq } from 'drizzle-orm';

import {
  defineRoute,
  NotFoundError,
  ok,
  ValidationError,
} from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'admin' })<{ questionId: string }>(async ({ params }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.questionId)) throw new NotFoundError('Question not found');

  const [question] = await db
    .select()
    .from(questions)
    .where(eq(questions.id, params.questionId))
    .limit(1);
  if (!question) throw new NotFoundError('Question not found');

  const opts = await db
    .select()
    .from(optionsTable)
    .where(eq(optionsTable.questionId, params.questionId))
    .orderBy(asc(optionsTable.sortOrder));

  return ok({ question, options: opts });
});

export const PATCH = defineRoute({
  auth: 'admin',
  bodySchema: questionUpdateInputSchema,
})<{ questionId: string }>(async ({ params, parsed }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.questionId)) throw new NotFoundError('Question not found');

  // Spread only the column-level fields (not `options` which is handled separately).
  const { options: nextOptions, ...columnUpdates } = parsed;

  // If options provided, ensure at least one is correct.
  if (nextOptions && !nextOptions.some((o) => o.isCorrect)) {
    throw new ValidationError({ options: 'At least one option must be marked correct' });
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.id, params.questionId))
      .limit(1);
    if (!existing) throw new NotFoundError('Question not found');

    if (Object.keys(columnUpdates).length > 0) {
      await tx
        .update(questions)
        .set(columnUpdates)
        .where(eq(questions.id, params.questionId));
    }

    if (nextOptions) {
      // Atomic replace: delete-then-insert. Safe because attempt_answers
      // references questions.id, not options.id, and we never hard-delete
      // questions. selected_option_ids is a jsonb snapshot at attempt
      // time, so option churn doesn't affect submitted attempts.
      await tx.delete(optionsTable).where(eq(optionsTable.questionId, params.questionId));
      await tx.insert(optionsTable).values(
        nextOptions.map((o, idx) => ({
          questionId: params.questionId,
          label: o.label,
          content: o.content,
          isCorrect: o.isCorrect,
          sortOrder: o.sortOrder ?? idx,
        })),
      );
    }
  });

  const [question] = await db
    .select()
    .from(questions)
    .where(eq(questions.id, params.questionId))
    .limit(1);
  const opts = await db
    .select()
    .from(optionsTable)
    .where(eq(optionsTable.questionId, params.questionId))
    .orderBy(asc(optionsTable.sortOrder));

  return ok({ question, options: opts });
});

export const DELETE = defineRoute({ auth: 'admin' })<{ questionId: string }>(async ({ params }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.questionId)) throw new NotFoundError('Question not found');

  // Soft-delete only — attempt_answers references this row.
  const result = await db
    .update(questions)
    .set({ isActive: false })
    .where(eq(questions.id, params.questionId))
    .returning({ id: questions.id });

  if (result.length === 0) throw new NotFoundError('Question not found');
  return ok({ deleted: true, questionId: params.questionId });
});
