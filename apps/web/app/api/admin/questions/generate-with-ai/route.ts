/**
 * POST /api/admin/questions/generate-with-ai
 *
 * Admin-only. Generates N questions for a topic via the provider
 * abstraction with strict structured output (tool_use ↔ function calling),
 * inserts them as is_active=false + generated_by_model=<model>. Admin
 * reviews each one in the moderation UI before approving.
 *
 * Provider routing (Sprint 5): DeepSeek primary, Claude Haiku fallback.
 * Generated questions are human-reviewed before they go live so the cost
 * win on DeepSeek matters more than the last 5% of authoring quality.
 *
 * No daily quota — this is an admin tool, the cost is borne by the
 * platform. Throughput limited to admin defaults via defineRoute.
 */

import {
  exams,
  options as optionsTable,
  questions,
  subjects as subjectsTable,
  topics,
} from '@examready/db/schema';
import { adminGenerateQuestionsInputSchema } from '@examready/shared';
import { eq } from 'drizzle-orm';

import { logAiCall } from '@/lib/ai/client';
import { AI_MODELS } from '@/lib/ai/constants';
import {
  buildGenerateQuestionsUserMessage,
  generatedQuestionBatchSchema,
  GENERATE_QUESTIONS_SYSTEM_PROMPT,
  GENERATE_QUESTIONS_TOOL,
} from '@/lib/ai/prompts/generate-questions';
import { getProvider, ProviderError, runWithFallback } from '@/lib/ai/providers';
import { ApiError, defineRoute, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'admin',
  bodySchema: adminGenerateQuestionsInputSchema,
})(async ({ parsed, user }) => {
  if (!user) throw new Error('user required');

  const routing = AI_MODELS.questionGen;
  const primaryConfigured = getProvider(routing.primary.provider).isConfigured();
  const fallbackConfigured =
    routing.fallback !== null && getProvider(routing.fallback.provider).isConfigured();
  if (!primaryConfigured && !fallbackConfigured) {
    throw new ApiError('BAD_GATEWAY', 'AI features are not configured on this deployment.', 503);
  }

  // Resolve topic + subject + exam names for the prompt context.
  const [topicRow] = await db
    .select({
      topicId: topics.id,
      topicName: topics.name,
      subjectId: subjectsTable.id,
      subjectName: subjectsTable.name,
      examId: exams.id,
      examName: exams.name,
    })
    .from(topics)
    .innerJoin(subjectsTable, eq(subjectsTable.id, topics.subjectId))
    .innerJoin(exams, eq(exams.id, subjectsTable.examId))
    .where(eq(topics.id, parsed.topicId))
    .limit(1);

  if (!topicRow) throw new NotFoundError('Topic not found');

  const userMessage = buildGenerateQuestionsUserMessage({
    examName: topicRow.examName,
    subjectName: topicRow.subjectName,
    topicName: topicRow.topicName,
    count: parsed.count,
    difficultyHint: parsed.difficultyHint,
  });

  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let succeeded = false;
  let usedProvider = routing.primary.provider;
  let usedModel = routing.primary.model;
  let wasFallback = false;

  try {
    const outcome = await runWithFallback(routing.primary, routing.fallback, (provider, model) =>
      provider.toolUse({
        model,
        maxTokens: 16384,
        systemPrompt: GENERATE_QUESTIONS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        tool: GENERATE_QUESTIONS_TOOL,
      }),
    );

    inputTokens = outcome.result.inputTokens;
    outputTokens = outcome.result.outputTokens;
    usedProvider = outcome.provider;
    usedModel = outcome.model;
    wasFallback = outcome.wasFallback;

    const validated = generatedQuestionBatchSchema.safeParse(outcome.result.input);
    if (!validated.success) {
      // eslint-disable-next-line no-console
      console.error('[ai/generate] schema validation failed:', validated.error.flatten());
      throw new ApiError('BAD_GATEWAY', 'AI returned questions in an unexpected format.', 502);
    }

    // Insert each question + options as is_active=false. The 'whyTempting'
    // field maps to questions.why_wrong is NOT yet on the schema (kept the
    // schema lean in this sprint) so we tuck it into the explanation text
    // for the admin to surface during moderation. This is a deliberate
    // tradeoff: schema bloat vs. preserving generation signal.
    const insertedIds: string[] = [];
    await db.transaction(async (tx) => {
      for (const q of validated.data.questions) {
        const explanationWithWhyWrong = (() => {
          const wrongs = q.options
            .filter((o) => !o.isCorrect && o.whyTempting)
            .map((o) => `\n\n[Why ${o.label} is wrong] ${o.whyTempting}`);
          return wrongs.length > 0 ? `${q.explanation}${wrongs.join('')}` : q.explanation;
        })();

        const [created] = await tx
          .insert(questions)
          .values({
            examId: topicRow.examId,
            subjectId: topicRow.subjectId,
            topicId: topicRow.topicId,
            questionType: q.questionType ?? 'mcq_single',
            stem: q.stem,
            difficulty: q.difficulty,
            source: 'ExamReady Practice',
            explanation: explanationWithWhyWrong,
            isActive: false, // moderation queue gate
            generatedByModel: usedModel,
            createdBy: user.profile.id,
          })
          .returning({ id: questions.id });

        if (!created) continue;
        insertedIds.push(created.id);

        await tx.insert(optionsTable).values(
          q.options.map((o, idx) => ({
            questionId: created.id,
            label: o.label,
            content: o.content,
            isCorrect: o.isCorrect,
            sortOrder: idx,
          })),
        );
      }
    });

    succeeded = true;
    return ok(
      {
        generated: insertedIds.length,
        questionIds: insertedIds,
        topic: topicRow.topicName,
        provider: usedProvider,
        model: usedModel,
        wasFallback,
        nextStep:
          'Review the generated questions in /admin/questions/ai-queue and approve, edit, or reject each.',
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ProviderError) {
      usedProvider = err.provider;
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError('BAD_GATEWAY', 'AI service error. Try again.', 502);
  } finally {
    await logAiCall({
      userId: user.profile.id,
      feature: 'admin_generate_questions',
      provider: usedProvider,
      model: usedModel,
      wasFallback,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      succeeded,
    });
  }
});
