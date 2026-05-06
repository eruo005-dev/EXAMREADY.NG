/**
 * GET /api/admin/questions/queue
 *
 * Lists pending AI-generated questions (generated_by_model IS NOT NULL,
 * is_active = false). Powers the /admin/questions/ai-queue moderation
 * UI. Uses the partial index questions_moderation_queue_idx.
 */
import {
  exams,
  options as optionsTable,
  questions,
  subjects as subjectsTable,
  topics,
} from '@examready/db/schema';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';


import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ auth: 'admin' })(async ({ req }) => {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);

  const rows = await db
    .select({
      id: questions.id,
      stem: questions.stem,
      explanation: questions.explanation,
      difficulty: questions.difficulty,
      generatedByModel: questions.generatedByModel,
      createdAt: questions.createdAt,
      examName: exams.name,
      subjectName: subjectsTable.name,
      topicName: topics.name,
      topicId: topics.id,
    })
    .from(questions)
    .innerJoin(topics, eq(topics.id, questions.topicId))
    .innerJoin(subjectsTable, eq(subjectsTable.id, questions.subjectId))
    .innerJoin(exams, eq(exams.id, questions.examId))
    .where(and(isNotNull(questions.generatedByModel), eq(questions.isActive, false)))
    .orderBy(desc(questions.createdAt))
    .limit(limit);

  if (rows.length === 0) {
    return ok({ pending: [] });
  }

  const ids = rows.map((r) => r.id);
  const opts = await db
    .select({
      questionId: optionsTable.questionId,
      id: optionsTable.id,
      label: optionsTable.label,
      content: optionsTable.content,
      isCorrect: optionsTable.isCorrect,
      sortOrder: optionsTable.sortOrder,
    })
    .from(optionsTable)
    .where(inArray(optionsTable.questionId, ids))
    .orderBy(asc(optionsTable.sortOrder));

  const optsByQuestion = new Map<string, typeof opts>();
  for (const o of opts) {
    const arr = optsByQuestion.get(o.questionId) ?? [];
    arr.push(o);
    optsByQuestion.set(o.questionId, arr);
  }

  return ok({
    pending: rows.map((r) => ({
      ...r,
      options: optsByQuestion.get(r.id) ?? [],
    })),
  });
});
