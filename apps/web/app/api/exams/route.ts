import { exams } from '@examready/db/schema';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const revalidate = 3600;

/**
 * Public exam list.
 *
 * Sprint 6 update — `coverage_status` enum gained two new values:
 *  - `beta` : visible in catalog with a "BETA" badge (WAEC SSCE / NECO SSCE)
 *  - `hidden`: never returned by this endpoint regardless of `include` (IELTS/TOEFL/SAT/etc.)
 *
 * Default includes both `live` AND `beta` so the catalog renders WAEC/NECO
 * out of the box. Pass ?include=coming_soon to surface the waitlist exams,
 * ?include=all for everything visible. Hidden exams are NEVER returned —
 * they're hidden from the public catalog entirely.
 */
export const GET = defineRoute({ auth: 'public' })(async ({ req }) => {
  const include = new URL(req.url).searchParams.get('include') ?? 'default';

  // Default catalog: live + beta. Active=true filter applies.
  // Coming-soon view: include coming_soon AND planned exams (active or not).
  // All: anything except hidden.
  let where;
  if (include === 'default') {
    where = and(eq(exams.isActive, true), inArray(exams.coverageStatus, ['live', 'beta'] as const));
  } else if (include === 'coming_soon') {
    where = inArray(exams.coverageStatus, ['coming_soon', 'planned'] as const);
  } else if (include === 'all') {
    // All visible-anywhere — explicitly exclude 'hidden'.
    where = ne(exams.coverageStatus, 'hidden');
  } else {
    // Backward-compat: 'live' returns only 'live'.
    where = and(eq(exams.isActive, true), eq(exams.coverageStatus, 'live'));
  }

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
