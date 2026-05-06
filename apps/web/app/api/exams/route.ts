import { exams } from '@examready/db/schema';
import { asc, eq } from 'drizzle-orm';


import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const revalidate = 3600;

export const GET = defineRoute({ auth: 'public' })(async () => {
  const rows = await db
    .select({
      id: exams.id,
      name: exams.name,
      slug: exams.slug,
      description: exams.description,
      iconUrl: exams.iconUrl,
      isActive: exams.isActive,
      sortOrder: exams.sortOrder,
    })
    .from(exams)
    .where(eq(exams.isActive, true))
    .orderBy(asc(exams.sortOrder));

  return ok(
    { exams: rows },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
});
