/**
 * Database seed script.
 *
 * Idempotent — uses ON CONFLICT DO NOTHING / lookups by slug. Re-running
 * after a partial run picks up where it left off.
 *
 * Seeds:
 *   - 10 exams (JAMB UTME, WAEC, NECO, GCE, Post-UTME, NABTEB, ICAN, JUPEB, IELTS, SAT)
 *   - 19 subjects (JAMB has 15, WAEC 5, NECO 2)
 *   - 17 topics (10 JAMB Math, 7 JAMB English)
 *   - 50 questions (25 JAMB Math + 25 JAMB English) with full options + explanations
 *
 * Bulk-import of real past papers comes through the admin CSV import tool
 * (later sprint), not this seed.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { eq } from 'drizzle-orm';

import { createDb } from '../src/client';
import {
  exams,
  options as optionsTable,
  questions,
  subjects,
  topics,
} from '../src/schema';

type ExamSeed = {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive?: boolean;
  coverageStatus?: 'live' | 'coming_soon' | 'planned';
};

type SubjectSeed = {
  slug: string;
  name: string;
  sortOrder: number;
};

type TopicSeed = {
  slug: string;
  name: string;
  frequencyScore: number;
};

type OptionSeed = {
  label: string;
  content: string;
  isCorrect?: boolean;
};

type QuestionSeed = {
  topic: string;
  year?: number;
  source?: string;
  difficulty: number;
  stem: string;
  passage?: string;
  options: OptionSeed[];
  explanation: string;
};

const dataDir = resolve(__dirname, 'data');
const readJson = <T>(filename: string): T =>
  JSON.parse(readFileSync(resolve(dataDir, filename), 'utf8')) as T;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[seed] ${msg}`);
};

async function seed(): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DIRECT_URL or DATABASE_URL must be set');

  const db = createDb(url);

  // -------- Exams --------
  const examSeeds = readJson<ExamSeed[]>('exams.json');
  const examIdBySlug = new Map<string, string>();
  for (const e of examSeeds) {
    const existing = await db.query.exams.findFirst({ where: eq(exams.slug, e.slug) });
    if (existing) {
      examIdBySlug.set(e.slug, existing.id);
      continue;
    }
    const [inserted] = await db
      .insert(exams)
      .values({
        slug: e.slug,
        name: e.name,
        description: e.description,
        sortOrder: e.sortOrder,
        isActive: e.isActive ?? true,
        coverageStatus: e.coverageStatus ?? 'live',
      })
      .returning({ id: exams.id });
    if (!inserted) throw new Error(`Failed to insert exam: ${e.slug}`);
    examIdBySlug.set(e.slug, inserted.id);
  }
  log(`exams: ${examIdBySlug.size}`);

  // -------- Subjects --------
  const subjectSeeds = readJson<Record<string, SubjectSeed[]>>('subjects.json');
  const subjectIdByExamAndSlug = new Map<string, string>();
  let subjectCount = 0;
  for (const [examSlug, subjectsForExam] of Object.entries(subjectSeeds)) {
    const examId = examIdBySlug.get(examSlug);
    if (!examId) throw new Error(`Unknown exam slug in subjects.json: ${examSlug}`);

    for (const s of subjectsForExam) {
      const key = `${examSlug}/${s.slug}`;
      const existing = await db.query.subjects.findFirst({
        where: (t, { and, eq: e }) => and(e(t.examId, examId), e(t.slug, s.slug)),
      });
      if (existing) {
        subjectIdByExamAndSlug.set(key, existing.id);
        continue;
      }
      const [inserted] = await db
        .insert(subjects)
        .values({ examId, slug: s.slug, name: s.name, sortOrder: s.sortOrder })
        .returning({ id: subjects.id });
      if (!inserted) throw new Error(`Failed to insert subject: ${key}`);
      subjectIdByExamAndSlug.set(key, inserted.id);
      subjectCount += 1;
    }
  }
  log(`subjects: ${subjectIdByExamAndSlug.size} (${subjectCount} new)`);

  // -------- Topics --------
  const topicSeeds = readJson<Record<string, TopicSeed[]>>('topics.json');
  const topicIdBySubjectAndSlug = new Map<string, string>();
  let topicCount = 0;
  for (const [path, topicsForSubject] of Object.entries(topicSeeds)) {
    const subjectId = subjectIdByExamAndSlug.get(path);
    if (!subjectId) throw new Error(`Unknown subject path in topics.json: ${path}`);

    for (const t of topicsForSubject) {
      const key = `${path}/${t.slug}`;
      const existing = await db.query.topics.findFirst({
        where: (tt, { and, eq: e }) => and(e(tt.subjectId, subjectId), e(tt.slug, t.slug)),
      });
      if (existing) {
        topicIdBySubjectAndSlug.set(key, existing.id);
        continue;
      }
      const [inserted] = await db
        .insert(topics)
        .values({
          subjectId,
          slug: t.slug,
          name: t.name,
          frequencyScore: t.frequencyScore,
        })
        .returning({ id: topics.id });
      if (!inserted) throw new Error(`Failed to insert topic: ${key}`);
      topicIdBySubjectAndSlug.set(key, inserted.id);
      topicCount += 1;
    }
  }
  log(`topics: ${topicIdBySubjectAndSlug.size} (${topicCount} new)`);

  // -------- Questions --------
  const insertQuestions = async (
    file: string,
    examSlug: string,
    subjectSlug: string,
  ): Promise<number> => {
    const examId = examIdBySlug.get(examSlug)!;
    const subjectKey = `${examSlug}/${subjectSlug}`;
    const subjectId = subjectIdByExamAndSlug.get(subjectKey);
    if (!subjectId) throw new Error(`Unknown subject: ${subjectKey}`);

    const seeds = readJson<QuestionSeed[]>(file);
    let inserted = 0;
    for (const q of seeds) {
      const topicKey = `${examSlug}/${subjectSlug}/${q.topic}`;
      const topicId = topicIdBySubjectAndSlug.get(topicKey);
      if (!topicId) {
        log(`skip — unknown topic ${topicKey}`);
        continue;
      }

      // De-dupe by exact stem within the same topic for idempotency.
      const existing = await db.query.questions.findFirst({
        where: (t, { and, eq: e }) => and(e(t.topicId, topicId), e(t.stem, q.stem)),
      });
      if (existing) continue;

      const [createdQ] = await db
        .insert(questions)
        .values({
          examId,
          subjectId,
          topicId,
          questionType: q.passage ? 'comprehension' : 'mcq_single',
          stem: q.stem,
          passage: q.passage,
          difficulty: q.difficulty,
          year: q.year,
          source: q.source,
          explanation: q.explanation,
          isActive: true,
        })
        .returning({ id: questions.id });
      if (!createdQ) throw new Error(`Failed to insert question: ${q.stem.slice(0, 40)}`);

      const optionRows = q.options.map((o, idx) => ({
        questionId: createdQ.id,
        label: o.label,
        content: o.content,
        isCorrect: o.isCorrect === true,
        sortOrder: idx,
      }));
      await db.insert(optionsTable).values(optionRows);
      inserted += 1;
    }
    return inserted;
  };

  const mathInserted = await insertQuestions(
    'jamb-math-questions.json',
    'jamb-utme',
    'mathematics',
  );
  log(`JAMB Math questions: ${mathInserted} new`);

  const englishInserted = await insertQuestions(
    'jamb-english-questions.json',
    'jamb-utme',
    'english-language',
  );
  log(`JAMB English questions: ${englishInserted} new`);

  log('Seed complete.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] Failed:', err);
    process.exit(1);
  });
