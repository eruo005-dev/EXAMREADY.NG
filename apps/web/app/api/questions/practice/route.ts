/**
 * GET /api/questions/practice
 *
 * Pulls questions for the chosen mode + filters. Strips is_correct from
 * options before serializing — clients never see correct answers until
 * the attempt is submitted.
 *
 * Query params parsed via practiceQuerySchema. The handler doesn't use
 * bodySchema because GET requests carry params in the URL — we parse
 * the URL ourselves.
 */

import { options, questions } from '@examready/db/schema';
import { practiceQuerySchema } from '@examready/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { defineRoute, ok, ValidationError } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'user' })(async ({ req }) => {
  const url = new URL(req.url);
  const queryObj: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
  // Multi-value topicIds support: get all values, not just one.
  const topicIds = url.searchParams.getAll('topicIds');
  if (topicIds.length > 0) {
    queryObj.topicIds = topicIds;
  }

  const parsed = practiceQuerySchema.safeParse(queryObj);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten());
  }
  const q = parsed.data;

  const filters = [eq(questions.examId, q.examId), eq(questions.isActive, true)];
  if (q.subjectId) filters.push(eq(questions.subjectId, q.subjectId));
  if (q.topicIds && q.topicIds.length > 0) filters.push(inArray(questions.topicId, q.topicIds));
  if (q.year) filters.push(eq(questions.year, q.year));
  if (q.difficulty) filters.push(eq(questions.difficulty, q.difficulty));

  // Random selection — RANDOM() is fine at our scale (1k-50k rows). For
  // larger tables we'd switch to TABLESAMPLE.
  const rows = await db
    .select({
      id: questions.id,
      examId: questions.examId,
      subjectId: questions.subjectId,
      topicId: questions.topicId,
      questionType: questions.questionType,
      stem: questions.stem,
      passage: questions.passage,
      media: questions.media,
      difficulty: questions.difficulty,
      year: questions.year,
      source: questions.source,
    })
    .from(questions)
    .where(and(...filters))
    .orderBy(sql`random()`)
    .limit(q.count);

  const totalAvailableRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questions)
    .where(and(...filters));
  const totalAvailable = totalAvailableRow[0]?.count ?? 0;

  if (rows.length === 0) {
    return ok({ questions: [], totalAvailable: 0 });
  }

  const questionIds = rows.map((r) => r.id);
  const opts = await db
    .select({
      id: options.id,
      questionId: options.questionId,
      label: options.label,
      content: options.content,
      sortOrder: options.sortOrder,
      // is_correct intentionally excluded.
    })
    .from(options)
    .where(inArray(options.questionId, questionIds))
    .orderBy(options.sortOrder);

  const optionsByQuestion = new Map<string, typeof opts>();
  opts.forEach((o) => {
    if (!optionsByQuestion.has(o.questionId)) {
      optionsByQuestion.set(o.questionId, []);
    }
    optionsByQuestion.get(o.questionId)!.push(o);
  });

  return ok({
    questions: rows.map((r) => ({
      ...r,
      options: (optionsByQuestion.get(r.id) ?? []).map(({ id, label, content, sortOrder }) => ({
        id,
        label,
        content,
        sortOrder,
      })),
    })),
    totalAvailable,
  });
});
