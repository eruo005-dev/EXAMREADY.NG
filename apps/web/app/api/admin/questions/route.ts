/**
 * GET  /api/admin/questions  — paginated, filterable list
 * POST /api/admin/questions  — create one question + options atomically
 */

import { options as optionsTable, questions } from '@examready/db/schema';
import {
  questionCreateInputSchema,
  questionListQuerySchema,
} from '@examready/shared';
import { and, asc, desc, eq, ilike, lt } from 'drizzle-orm';

import { defineRoute, ok, ValidationError } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'admin' })(async ({ req }) => {
  const url = new URL(req.url);
  const parsed = questionListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const q = parsed.data;

  const filters = [];
  if (q.examId) filters.push(eq(questions.examId, q.examId));
  if (q.subjectId) filters.push(eq(questions.subjectId, q.subjectId));
  if (q.topicId) filters.push(eq(questions.topicId, q.topicId));
  if (q.year) filters.push(eq(questions.year, q.year));
  if (q.isActive !== undefined) filters.push(eq(questions.isActive, q.isActive));
  if (q.q) filters.push(ilike(questions.stem, `%${q.q}%`));

  if (q.cursor) {
    // Cursor is the last question's createdAt — fetch the cursor row's
    // createdAt value to build the keyset filter.
    const [cursorRow] = await db
      .select({ createdAt: questions.createdAt })
      .from(questions)
      .where(eq(questions.id, q.cursor))
      .limit(1);
    if (cursorRow) {
      filters.push(lt(questions.createdAt, cursorRow.createdAt));
    }
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: questions.id,
      examId: questions.examId,
      subjectId: questions.subjectId,
      topicId: questions.topicId,
      questionType: questions.questionType,
      stem: questions.stem,
      difficulty: questions.difficulty,
      year: questions.year,
      source: questions.source,
      isActive: questions.isActive,
      createdAt: questions.createdAt,
    })
    .from(questions)
    .where(where)
    .orderBy(desc(questions.createdAt))
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const sliced = hasMore ? rows.slice(0, q.limit) : rows;
  const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

  return ok({ questions: sliced, nextCursor });
});

export const POST = defineRoute({
  auth: 'admin',
  bodySchema: questionCreateInputSchema,
})(async ({ parsed }) => {
  // Refuse if no option is marked correct — common admin mistake.
  if (!parsed.options.some((o) => o.isCorrect)) {
    throw new ValidationError({ options: 'At least one option must be marked correct' });
  }

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(questions)
      .values({
        examId: parsed.examId,
        subjectId: parsed.subjectId,
        topicId: parsed.topicId,
        questionType: parsed.questionType,
        stem: parsed.stem,
        passage: parsed.passage,
        media: parsed.media ?? [],
        difficulty: parsed.difficulty,
        year: parsed.year,
        source: parsed.source,
        explanation: parsed.explanation,
        frequencyScore: parsed.frequencyScore,
        isActive: parsed.isActive,
      })
      .returning();
    if (!created) throw new Error('Failed to insert question');

    await tx.insert(optionsTable).values(
      parsed.options.map((o, idx) => ({
        questionId: created.id,
        label: o.label,
        content: o.content,
        isCorrect: o.isCorrect,
        sortOrder: o.sortOrder ?? idx,
      })),
    );

    return created;
  });

  // Return the full object including options for immediate display in admin UI.
  const fullOptions = await db
    .select()
    .from(optionsTable)
    .where(eq(optionsTable.questionId, result.id))
    .orderBy(asc(optionsTable.sortOrder));

  return ok({ question: result, options: fullOptions }, { status: 201 });
});
