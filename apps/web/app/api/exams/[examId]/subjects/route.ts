import { subjects } from '@examready/db/schema';
import { asc, eq } from 'drizzle-orm';


import { defineRoute, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const revalidate = 3600;

export const GET = defineRoute({ auth: 'public' })<{ examId: string }>(async ({ params }) => {
  // The dynamic [examId] is a UUID — Zod-validate manually since the
  // path params don't go through bodySchema. Bad UUIDs get a 404 not a 400
  // (consistent with Postgres returning 0 rows for malformed casts).
  if (!/^[0-9a-f-]{36}$/i.test(params.examId)) {
    throw new NotFoundError('Exam not found');
  }

  const rows = await db
    .select({
      id: subjects.id,
      name: subjects.name,
      slug: subjects.slug,
      iconUrl: subjects.iconUrl,
      sortOrder: subjects.sortOrder,
    })
    .from(subjects)
    .where(eq(subjects.examId, params.examId))
    .orderBy(asc(subjects.sortOrder));

  return ok(
    { subjects: rows },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
});
