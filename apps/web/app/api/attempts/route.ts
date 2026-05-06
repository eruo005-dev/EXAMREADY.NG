/**
 * POST /api/attempts
 *
 * Starts a new attempt. For free-tier users in mock_cbt mode, enforces
 * the rolling 7-day cap: if their last submitted mock_cbt was within 7
 * days, return 403 TIER_LIMIT_EXCEEDED with nextAvailableAt so the UI
 * can render "Next mock available in 4 days, 3 hours."
 *
 * Inserts the attempt + N empty attempt_answers in a single transaction.
 */
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import {
  attemptAnswers,
  attempts,
  options,
  questions,
} from '@examready/db/schema';
import { startAttemptSchema } from '@examready/shared';

import {
  defineRoute,
  NotFoundError,
  ok,
  TierLimitExceededError,
} from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const POST = defineRoute({
  auth: 'user',
  bodySchema: startAttemptSchema,
})(async ({ parsed, user }) => {
  if (!user) throw new Error('user required'); // narrowing — handler enforces

  // Free-tier rolling 7-day mock_cbt cap.
  if (parsed.mode === 'mock_cbt' && user.profile.subscriptionTier === 'free') {
    const lastMock = await db
      .select({ submittedAt: attempts.submittedAt })
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, user.profile.id),
          eq(attempts.mode, 'mock_cbt'),
          isNotNull(attempts.submittedAt),
        ),
      )
      .orderBy(desc(attempts.submittedAt))
      .limit(1);

    const last = lastMock[0]?.submittedAt;
    if (last) {
      const elapsed = Date.now() - last.getTime();
      if (elapsed < SEVEN_DAYS_MS) {
        const nextAt = new Date(last.getTime() + SEVEN_DAYS_MS);
        throw new TierLimitExceededError(
          'Free tier is limited to 1 mock CBT every 7 days. Upgrade for unlimited mocks.',
          nextAt.toISOString(),
        );
      }
    }
  }

  // Validate that all questionIds belong to the chosen exam — prevents a
  // crafty client from mixing exams.
  const validQuestions = await db
    .select({ id: questions.id })
    .from(questions)
    .where(
      and(
        inArray(questions.id, parsed.questionIds),
        eq(questions.examId, parsed.examId),
        eq(questions.isActive, true),
      ),
    );
  if (validQuestions.length !== parsed.questionIds.length) {
    throw new NotFoundError('One or more questions not found in this exam');
  }

  // Insert attempt + empty answer rows in a transaction.
  const result = await db.transaction(async (tx) => {
    const [attempt] = await tx
      .insert(attempts)
      .values({
        userId: user.profile.id,
        mode: parsed.mode,
        examId: parsed.examId,
        subjectId: parsed.subjectId,
        topicId: parsed.topicId,
        totalQuestions: parsed.questionIds.length,
        timeLimitSeconds: parsed.timeLimitSeconds,
      })
      .returning();
    if (!attempt) throw new Error('Failed to insert attempt');

    await tx.insert(attemptAnswers).values(
      parsed.questionIds.map((qid) => ({
        attemptId: attempt.id,
        questionId: qid,
      })),
    );

    return attempt;
  });

  // Fetch the questions + options (no is_correct) to return so the client
  // can start the runner immediately without a second roundtrip.
  const fullQuestions = await db
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
    .where(inArray(questions.id, parsed.questionIds));

  const opts = await db
    .select({
      id: options.id,
      questionId: options.questionId,
      label: options.label,
      content: options.content,
      sortOrder: options.sortOrder,
    })
    .from(options)
    .where(inArray(options.questionId, parsed.questionIds))
    .orderBy(options.sortOrder);

  const optionsByQuestion = new Map<string, typeof opts>();
  opts.forEach((o) => {
    if (!optionsByQuestion.has(o.questionId)) optionsByQuestion.set(o.questionId, []);
    optionsByQuestion.get(o.questionId)!.push(o);
  });

  // Preserve the order the client requested — don't return random order.
  const ordered = parsed.questionIds
    .map((id) => fullQuestions.find((q) => q.id === id))
    .filter((q): q is (typeof fullQuestions)[number] => q !== undefined)
    .map((q) => ({
      ...q,
      options: (optionsByQuestion.get(q.id) ?? []).map(({ id, label, content, sortOrder }) => ({
        id,
        label,
        content,
        sortOrder,
      })),
    }));

  return ok({
    attemptId: result.id,
    startedAt: result.startedAt.toISOString(),
    questions: ordered,
  });
});
