import { bookmarks, questions } from '@examready/db/schema';
import { and, eq } from 'drizzle-orm';


import { defineRoute, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({ auth: 'user' })<{ questionId: string }>(async ({ params, user }) => {
  if (!user) throw new Error('user required');
  if (!/^[0-9a-f-]{36}$/i.test(params.questionId)) throw new NotFoundError('Question not found');

  // Verify question exists and is active before bookmarking.
  const [q] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.id, params.questionId), eq(questions.isActive, true)))
    .limit(1);
  if (!q) throw new NotFoundError('Question not found');

  await db
    .insert(bookmarks)
    .values({ userId: user.profile.id, questionId: params.questionId })
    .onConflictDoNothing();

  return ok({ bookmarked: true });
});

export const DELETE = defineRoute({ auth: 'user' })<{ questionId: string }>(async ({ params, user }) => {
  if (!user) throw new Error('user required');
  if (!/^[0-9a-f-]{36}$/i.test(params.questionId)) throw new NotFoundError('Question not found');

  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, user.profile.id), eq(bookmarks.questionId, params.questionId)));

  return ok({ bookmarked: false });
});
