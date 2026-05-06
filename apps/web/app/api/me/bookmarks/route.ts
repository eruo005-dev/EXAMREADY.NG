import { bookmarks, questions } from '@examready/db/schema';
import { paginationSchema } from '@examready/shared';
import { and, desc, eq, lt } from 'drizzle-orm';


import { defineRoute, ok, ValidationError } from '@/lib/api/handler';
import { db } from '@/lib/db';


export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'user' })(async ({ req, user }) => {
  if (!user) throw new Error('user required');
  const url = new URL(req.url);
  const parsed = paginationSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const { cursor, limit } = parsed.data;

  // Cursor pagination by created_at — but we don't have a separate cursor
  // table. Use bookmarks.createdAt as a tiebreaker via a composite cursor
  // would be cleaner; for Sprint 0 we use questionId since the page size
  // is small and gaps are acceptable.
  const cursorWhere = cursor
    ? lt(bookmarks.createdAt,
        (
          await db
            .select({ at: bookmarks.createdAt })
            .from(bookmarks)
            .where(and(eq(bookmarks.userId, user.profile.id), eq(bookmarks.questionId, cursor)))
            .limit(1)
        )[0]?.at ?? new Date(),
      )
    : undefined;

  const rows = await db
    .select({
      questionId: bookmarks.questionId,
      createdAt: bookmarks.createdAt,
      stem: questions.stem,
      difficulty: questions.difficulty,
      year: questions.year,
      source: questions.source,
    })
    .from(bookmarks)
    .innerJoin(questions, eq(questions.id, bookmarks.questionId))
    .where(cursorWhere ? and(eq(bookmarks.userId, user.profile.id), cursorWhere) : eq(bookmarks.userId, user.profile.id))
    .orderBy(desc(bookmarks.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? sliced[sliced.length - 1]?.questionId ?? null : null;

  return ok({ bookmarks: sliced, nextCursor });
});
