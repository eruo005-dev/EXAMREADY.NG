import { exams } from '@examready/db/schema';
import { and, asc, eq } from 'drizzle-orm';

import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const revalidate = 3600;

/**
 * Public exam list. By default returns only `live` exams (the practice
 * catalog). Pass ?include=coming_soon or ?include=all to surface
 * upcoming exams — used by /coming-soon to render the waitlist page
 * and the admin UI to pick exam slugs for content backfill.
 */
export const GET = defineRoute({ auth: 'public' })(async ({ req }) => {
  const include = new URL(req.url).searchParams.get('include') ?? 'live';

  const filters = [eq(exams.isActive, true)];
  if (include === 'live') filters.push(eq(exams.coverageStatus, 'live'));
  // include === 'coming_soon' or 'all' relaxes the active filter too.
  const where = include === 'live' ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: exams.id,
      name: exams.name,
      slug: exams.slug,
      description: exams.description,
      iconUrl: exams.iconUrl,
      isActive: exams.isActive,
      coverageStatus: exams.coverageStatus,
      sortOrder: exams.sortOrder,
    })
    .from(exams)
    .where(where)
    .orderBy(asc(exams.sortOrder));

  return ok(
    { exams: rows },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
});
