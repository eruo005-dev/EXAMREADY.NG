/**
 * /cbt/[attemptId] — JAMB-fidelity CBT runner page.
 *
 * Lives outside the (app) route group on purpose: the CBT exam UI must
 * be full-screen with no app shell. The runner is a Server Component
 * that fetches the attempt + question set, then hands off to the
 * client `CbtPageClient` which mounts the CbtRunner.
 *
 * Auth gate: if no session → /login (with returnTo to here). If the
 * attempt belongs to a different user, NotFoundError-shaped 404 to
 * avoid leaking attempt existence.
 */
import {
  attemptAnswers,
  attempts,
  exams,
  options,
  questions,
  subjects,
  users,
} from '@examready/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';

import { createServerClient } from '@/lib/auth/server';
import { db } from '@/lib/db';

import { CbtPageClient } from './CbtPageClient';

// Server-rendered per-request — never cache.
export const dynamic = 'force-dynamic';

export default async function CbtPage({ params }: { params: { attemptId: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?returnTo=/cbt/${params.attemptId}`);

  const profile = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!profile) redirect('/login');

  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, params.attemptId),
  });
  if (!attempt) notFound();
  if (attempt.userId !== profile.id) notFound();

  // Already submitted → bounce to results.
  if (attempt.submittedAt) redirect(`/results/${attempt.id}`);

  // Pull the question set + options. Order by attempt_answers.position so
  // the candidate sees them in the same order across navigations.
  const answers = await db
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, attempt.id));
  if (answers.length === 0) {
    return (
      <div className="p-12 text-center">
        <h1 className="text-xl font-semibold">No questions in this attempt</h1>
        <p className="text-muted-foreground mt-2">
          Pick a fresh practice or mock from the dashboard.
        </p>
      </div>
    );
  }

  // attempt_answers doesn't carry an explicit position column today;
  // we sort by id (UUIDv4 stable order) which matches the order they
  // were inserted in /api/attempts. Once Phase-5 adds an explicit
  // position column to attempt_answers we can swap to that.
  const orderedQuestionIds = answers
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => a.questionId);

  const questionRows = await db
    .select({
      id: questions.id,
      stem: questions.stem,
      passage: questions.passage,
      subjectId: questions.subjectId,
    })
    .from(questions)
    .where(inArray(questions.id, orderedQuestionIds));

  const optionRows = await db
    .select()
    .from(options)
    .where(inArray(options.questionId, orderedQuestionIds));

  const subjectRows = await db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(inArray(subjects.id, Array.from(new Set(questionRows.map((q) => q.subjectId)))));
  const subjectById = new Map(subjectRows.map((s) => [s.id, s]));

  const optionsByQuestion = new Map<
    string,
    { id: string; label: string; content: string; sortOrder: number }[]
  >();
  for (const o of optionRows) {
    const arr = optionsByQuestion.get(o.questionId) ?? [];
    arr.push({ id: o.id, label: o.label, content: o.content, sortOrder: o.sortOrder });
    optionsByQuestion.set(o.questionId, arr);
  }
  for (const arr of optionsByQuestion.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);

  const questionById = new Map(questionRows.map((q) => [q.id, q]));

  const cbtQuestions = orderedQuestionIds.map((qid, idx) => {
    const q = questionById.get(qid);
    const subject = q ? subjectById.get(q.subjectId) : undefined;
    return {
      id: qid,
      index: idx,
      stem: q?.stem ?? '',
      passage: q?.passage ?? undefined,
      options: (optionsByQuestion.get(qid) ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        content: o.content,
      })),
      subject: subject ? { id: subject.id, name: subject.name } : undefined,
    };
  });

  const initialAnswers: Record<string, string | null> = {};
  const initialFlags: Record<string, boolean> = {};
  for (const a of answers) {
    // attempt_answers stores a string[] for selectedOptionIds (multi-
    // select forward-compat). The CBT runner today is single-select
    // only, so we surface the first element.
    const picked =
      a.selectedOptionIds && a.selectedOptionIds.length > 0 ? a.selectedOptionIds[0]! : null;
    initialAnswers[a.questionId] = picked;
    initialFlags[a.questionId] = a.flagged ?? false;
  }

  const exam = attempt.examId
    ? await db.query.exams.findFirst({ where: eq(exams.id, attempt.examId) })
    : null;

  // Deadline: startedAt + timeLimitSeconds. attempts.timeLimitSeconds is
  // set when the attempt is created (POST /api/attempts copies the
  // user's selected duration). Fallback of 30 minutes catches very old
  // rows that pre-date that field.
  const startedAt = attempt.startedAt ?? new Date();
  const limitSec = attempt.timeLimitSeconds ?? 30 * 60;
  const endsAt = new Date(startedAt.getTime() + limitSec * 1000);
  const remainingSeconds = Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));

  return (
    <CbtPageClient
      attempt={{
        id: attempt.id,
        candidateName: profile.fullName ?? user.email ?? 'Candidate',
        subjectLabel: exam?.name ?? 'Mock CBT',
        remainingSeconds,
        endsAt: endsAt.toISOString(),
      }}
      questions={cbtQuestions}
      initialAnswers={initialAnswers}
      initialFlags={initialFlags}
    />
  );
}
