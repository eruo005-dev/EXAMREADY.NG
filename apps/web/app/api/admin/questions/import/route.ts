/**
 * POST /api/admin/questions/import
 *
 * Accepts a multipart/form-data upload with a CSV file under `file`. Parses,
 * validates, looks up exam/subject/topic slugs to UUIDs, then inserts in
 * batches. Cap: 1000 rows per upload.
 *
 * Response: { inserted: number, errors: Array<{ row, message }> }.
 * Either count can be > 0 (some rows valid, others bad — partial success).
 *
 * Format: see CSV_FORMAT.md alongside this route.
 */
import {
  exams as examsTable,
  options as optionsTable,
  questions as questionsTable,
  subjects as subjectsTable,
  topics as topicsTable,
} from '@examready/db/schema';
import { eq } from 'drizzle-orm';


import { parseCsvQuestions, type SlugLookups } from '@/lib/admin/csv-questions';
import { ApiError, defineRoute, ok, ValidationError } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

async function buildLookups(): Promise<SlugLookups> {
  const examSlugToId = new Map<string, string>();
  const subjectSlugToId = new Map<string, string>();
  const topicSlugToId = new Map<string, string>();

  const exams = await db
    .select({ id: examsTable.id, slug: examsTable.slug })
    .from(examsTable);
  exams.forEach((e) => examSlugToId.set(e.slug, e.id));

  const subjects = await db
    .select({
      id: subjectsTable.id,
      slug: subjectsTable.slug,
      examSlug: examsTable.slug,
    })
    .from(subjectsTable)
    .innerJoin(examsTable, eq(examsTable.id, subjectsTable.examId));
  subjects.forEach((s) => subjectSlugToId.set(`${s.examSlug}/${s.slug}`, s.id));

  const topics = await db
    .select({
      id: topicsTable.id,
      slug: topicsTable.slug,
      subjectSlug: subjectsTable.slug,
      examSlug: examsTable.slug,
    })
    .from(topicsTable)
    .innerJoin(subjectsTable, eq(subjectsTable.id, topicsTable.subjectId))
    .innerJoin(examsTable, eq(examsTable.id, subjectsTable.examId));
  topics.forEach((t) =>
    topicSlugToId.set(`${t.examSlug}/${t.subjectSlug}/${t.slug}`, t.id),
  );

  return { examSlugToId, subjectSlugToId, topicSlugToId };
}

export const POST = defineRoute({ auth: 'admin' })(async ({ req }) => {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('multipart/form-data')) {
    throw new ValidationError({
      contentType: 'Expected multipart/form-data with `file` field',
    });
  }

  const form = await req.formData();
  const fileEntry = form.get('file');
  if (!(fileEntry instanceof File)) {
    throw new ValidationError({ file: 'Missing file field' });
  }
  if (fileEntry.size > MAX_FILE_BYTES) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `File too large: ${fileEntry.size} bytes. Max ${MAX_FILE_BYTES}.`,
      413,
    );
  }

  const csv = await fileEntry.text();

  const lookups = await buildLookups();
  const { rows, errors } = parseCsvQuestions(csv, lookups);

  // Insert all valid rows in one transaction so a mid-batch failure rolls
  // back. Per-row errors from validation are returned alongside the count.
  let inserted = 0;
  if (rows.length > 0) {
    await db.transaction(async (tx) => {
      for (const row of rows) {
        const [created] = await tx
          .insert(questionsTable)
          .values({
            examId: row.examId,
            subjectId: row.subjectId,
            topicId: row.topicId,
            questionType: row.questionType,
            stem: row.stem,
            passage: row.passage,
            media: row.media ?? [],
            difficulty: row.difficulty,
            year: row.year,
            source: row.source,
            explanation: row.explanation,
            frequencyScore: row.frequencyScore,
            isActive: row.isActive,
          })
          .returning({ id: questionsTable.id });
        if (!created) continue;

        await tx.insert(optionsTable).values(
          row.options.map((o, idx) => ({
            questionId: created.id,
            label: o.label,
            content: o.content,
            isCorrect: o.isCorrect,
            sortOrder: o.sortOrder ?? idx,
          })),
        );
        inserted += 1;
      }
    });
  }

  return ok({ inserted, errors });
});

// Export for tests that need to build lookups against a test DB.
export const _testInternals = { buildLookups };
