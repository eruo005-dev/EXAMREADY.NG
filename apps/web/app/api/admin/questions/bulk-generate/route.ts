/**
 * POST /api/admin/questions/bulk-generate
 *
 * Admin-only. Triggers a fan-out batch question-generation job:
 *   1. Resolves all topics for the requested subject
 *   2. Creates one bulk_generation_jobs row to track aggregate progress
 *   3. Enqueues one QStash message per topic, pointing at the worker
 *      route which generates `targetCountPerTopic` questions for that topic
 *
 * The worker writes to ai_usage_log + the questions/options tables (as
 * is_active=false in the moderation queue) and increments the parent job
 * row's completed/failed counters.
 *
 * Cost guardrail: the route refuses to enqueue more than ~100 questions
 * across the whole batch in one call. Bigger runs need to be split. This
 * is conservative — the underlying DeepSeek rate limit is much higher,
 * but at admin-mass-generation time we'd rather find a prompt issue
 * after 100 questions than after 1000.
 */
import { bulkGenerationJobs, subjects, topics } from '@examready/db/schema';
import { bulkGenerateInputSchema } from '@examready/shared';
import { eq } from 'drizzle-orm';

import { ApiError, defineRoute, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { enqueue } from '@/lib/qstash';

export const dynamic = 'force-dynamic';

const MAX_QUESTIONS_PER_BATCH = 600; // 50 questions × 12 topics

export const POST = defineRoute({
  auth: 'admin',
  bodySchema: bulkGenerateInputSchema,
})(async ({ parsed, user, req }) => {
  if (!user) throw new Error('user required');

  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, parsed.subjectId),
  });
  if (!subject) throw new NotFoundError('Subject not found');

  const topicRows = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(eq(topics.subjectId, parsed.subjectId));

  if (topicRows.length === 0) {
    throw new ApiError(
      'CONFLICT',
      'Subject has no topics configured. Add topics before bulk-generating.',
      409,
    );
  }

  const totalQuestions = topicRows.length * parsed.targetCountPerTopic;
  if (totalQuestions > MAX_QUESTIONS_PER_BATCH) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Batch would generate ${totalQuestions} questions; cap is ${MAX_QUESTIONS_PER_BATCH}. Reduce targetCountPerTopic or split into smaller subjects.`,
      400,
    );
  }

  // Pick the difficulty hint for each topic. We rotate through the
  // {easy, medium, hard} counts so each topic's batch maps to the
  // requested distribution. This is intentionally simple — the
  // generator's per-call difficulty hint affects 10 questions; getting
  // the precise distribution would require per-question hinting which
  // we don't yet have.
  const dominantDifficulty = (() => {
    const d = parsed.difficultyDistribution;
    if (d.hard > d.easy && d.hard > d.medium) return 'harder' as const;
    if (d.easy > d.medium && d.easy > d.hard) return 'easier' as const;
    return 'mixed' as const;
  })();

  // Insert the parent job row.
  const [jobRow] = await db
    .insert(bulkGenerationJobs)
    .values({
      startedByUserId: user.profile.id,
      subjectId: parsed.subjectId,
      difficultyDistribution: parsed.difficultyDistribution,
      targetCountPerTopic: parsed.targetCountPerTopic,
      totalJobs: topicRows.length,
      status: 'queued',
    })
    .returning({ id: bulkGenerationJobs.id });
  if (!jobRow) throw new ApiError('INTERNAL_ERROR', 'Failed to create job row', 500);

  // Compute the worker URL from the request origin so dev / staging /
  // prod all work without hardcoded base URL config. QStash pings this
  // back as the destination.
  const origin = new URL(req.url).origin;
  const workerUrl = `${origin}/api/admin/jobs/generate-questions-batch`;

  // Enqueue one message per topic. Failures here are logged but don't
  // unwind the parent row — the job goes to status='running' and the
  // count comes out short. Admins see this in the UI as "10/12 completed".
  let enqueued = 0;
  for (const topic of topicRows) {
    const result = await enqueue(workerUrl, {
      jobId: jobRow.id,
      topicId: topic.id,
      count: parsed.targetCountPerTopic,
      difficultyHint: dominantDifficulty,
    });
    if (result.ok) enqueued += 1;
  }

  if (enqueued > 0) {
    await db
      .update(bulkGenerationJobs)
      .set({ status: 'running' })
      .where(eq(bulkGenerationJobs.id, jobRow.id));
  } else {
    await db
      .update(bulkGenerationJobs)
      .set({ status: 'failed', notes: 'No QStash messages enqueued — check UPSTASH_QSTASH_TOKEN.' })
      .where(eq(bulkGenerationJobs.id, jobRow.id));
    throw new ApiError(
      'BAD_GATEWAY',
      'Failed to enqueue any worker jobs. Check QStash configuration.',
      502,
    );
  }

  return ok(
    {
      jobId: jobRow.id,
      subject: subject.name,
      topicsQueued: enqueued,
      questionsExpected: enqueued * parsed.targetCountPerTopic,
      monitorUrl: `/admin/bulk-generation-jobs/${jobRow.id}`,
    },
    { status: 202 },
  );
});
