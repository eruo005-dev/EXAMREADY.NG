/**
 * GET /api/admin/waitlist
 *
 * Admin view of /coming-soon waitlist signups, grouped by exam_slug. The
 * UI page also exports CSV from this data.
 *
 * Returns groups + individual signups per group. Individual rows let the
 * admin spot-check; groups drive the prioritization decision (which
 * coming_soon exam to graduate to live next).
 */
import { exams, examWaitlist } from '@examready/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'admin' })(async ({ req }) => {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10), 5000);

  const groups = await db
    .select({
      examSlug: examWaitlist.examSlug,
      examName: exams.name,
      examCoverageStatus: exams.coverageStatus,
      signupCount: sql<number>`count(*)::int`,
      latestSignupAt: sql<Date>`max(${examWaitlist.createdAt})`,
    })
    .from(examWaitlist)
    .leftJoin(exams, eq(exams.slug, examWaitlist.examSlug))
    .groupBy(examWaitlist.examSlug, exams.name, exams.coverageStatus)
    .orderBy(sql`count(*) desc`);

  const recent = await db
    .select({
      id: examWaitlist.id,
      email: examWaitlist.email,
      examSlug: examWaitlist.examSlug,
      sourceUrl: examWaitlist.sourceUrl,
      createdAt: examWaitlist.createdAt,
      notifiedAt: examWaitlist.notifiedAt,
    })
    .from(examWaitlist)
    .orderBy(desc(examWaitlist.createdAt))
    .limit(limit);

  return ok({
    groups: groups.map((g) => ({
      ...g,
      // Coerce email-domain emails to bigint -> number is unsafe at large counts;
      // here signupCount is already int via the cast.
      signupCount: g.signupCount,
    })),
    recent,
  });
});
