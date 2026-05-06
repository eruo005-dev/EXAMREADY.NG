/**
 * GET /api/admin/bulk-generation-jobs
 *
 * Lists in-progress and recent bulk-generation jobs for the admin
 * monitor page. Returns the parent rows + computed progress percent.
 */
import { bulkGenerationJobs, subjects, users } from '@examready/db/schema';
import { desc, eq } from 'drizzle-orm';

import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'admin' })(async ({ req }) => {
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') ?? '30', 10), 100);

  const rows = await db
    .select({
      id: bulkGenerationJobs.id,
      status: bulkGenerationJobs.status,
      subjectName: subjects.name,
      startedByEmail: users.email,
      totalJobs: bulkGenerationJobs.totalJobs,
      completedJobs: bulkGenerationJobs.completedJobs,
      failedJobs: bulkGenerationJobs.failedJobs,
      questionsGenerated: bulkGenerationJobs.questionsGenerated,
      targetCountPerTopic: bulkGenerationJobs.targetCountPerTopic,
      startedAt: bulkGenerationJobs.startedAt,
      completedAt: bulkGenerationJobs.completedAt,
      notes: bulkGenerationJobs.notes,
    })
    .from(bulkGenerationJobs)
    .innerJoin(subjects, eq(subjects.id, bulkGenerationJobs.subjectId))
    .innerJoin(users, eq(users.id, bulkGenerationJobs.startedByUserId))
    .orderBy(desc(bulkGenerationJobs.startedAt))
    .limit(limit);

  return ok({
    jobs: rows.map((r) => ({
      ...r,
      progressPercent:
        r.totalJobs > 0 ? Math.round(((r.completedJobs + r.failedJobs) / r.totalJobs) * 100) : 0,
    })),
  });
});
