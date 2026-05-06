/**
 * POST /api/admin/jobs/generate-questions-batch
 *
 * QStash worker for the bulk-generate fan-out. Receives one
 * { jobId, topicId, count, difficultyHint } payload at a time, generates
 * the questions via the AI provider, inserts them as is_active=false,
 * and increments the parent bulk_generation_jobs row.
 *
 * Auth: QStash signature on the raw body. Without that, anyone could
 * fan out free generation calls — see lib/qstash.ts.
 *
 * On error: increments failedJobs on the parent row, returns 500 so
 * QStash retries (it'll dedupe on its message ID).
 *
 * On success: increments completedJobs + questionsGenerated. When the
 * sum of completed + failed equals totalJobs, marks status=completed.
 */
import {
  bulkGenerationJobs,
  exams,
  options as optionsTable,
  questions,
  subjects as subjectsTable,
  topics,
} from '@examready/db/schema';
import { bulkGenerateBatchPayloadSchema } from '@examready/shared';
import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { logAiCall } from '@/lib/ai/client';
import { AI_MODELS, resolveRouting } from '@/lib/ai/constants';
import {
  buildGenerateQuestionsUserMessage,
  generatedQuestionBatchSchema,
  GENERATE_QUESTIONS_SYSTEM_PROMPT,
  GENERATE_QUESTIONS_TOOL,
} from '@/lib/ai/prompts/generate-questions';
import { ProviderError, runWithFallback } from '@/lib/ai/providers';
import { db } from '@/lib/db';
import { verifyQStashSignature } from '@/lib/qstash';

export const dynamic = 'force-dynamic';

// QStash retries on 5xx; 4xx ends delivery. Use 5xx for transient
// errors (AI timeout) and 4xx for permanent ones (invalid payload).
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const url = req.url;
  const signature = req.headers.get('upstash-signature');

  const sigOk = await verifyQStashSignature(rawBody, signature, url);
  if (!sigOk) {
    return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = bulkGenerateBatchPayloadSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    return NextResponse.json({ error: 'Invalid payload', details: String(err) }, { status: 400 });
  }

  // Resolve topic + subject + exam for the prompt context.
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
    .where(eq(topics.id, payload.topicId))
    .limit(1);

  if (!topicRow) {
    await markFailed(payload.jobId, `Topic ${payload.topicId} not found`);
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  }

  const userMessage = buildGenerateQuestionsUserMessage({
    examName: topicRow.examName,
    subjectName: topicRow.subjectName,
    topicName: topicRow.topicName,
    count: payload.count,
    difficultyHint: payload.difficultyHint,
  });

  const routing = resolveRouting(AI_MODELS.questionGen);
  const start = Date.now();
  let usedProvider = routing.primary.provider;
  let usedModel = routing.primary.model;
  let wasFallback = false;
  let inputTokens = 0;
  let outputTokens = 0;

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
      console.error('[bulk-gen worker] schema validation failed:', validated.error.flatten());
      await markFailed(payload.jobId, 'AI returned questions in an unexpected format');
      return NextResponse.json({ error: 'Schema validation failed' }, { status: 502 });
    }

    let inserted = 0;
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
            isActive: false,
            generatedByModel: usedModel,
          })
          .returning({ id: questions.id });
        if (!created) continue;
        inserted += 1;

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

    // Increment parent counters atomically.
    const [updated] = await db
      .update(bulkGenerationJobs)
      .set({
        completedJobs: sql`${bulkGenerationJobs.completedJobs} + 1`,
        questionsGenerated: sql`${bulkGenerationJobs.questionsGenerated} + ${inserted}`,
      })
      .where(eq(bulkGenerationJobs.id, payload.jobId))
      .returning();

    // If parent is now complete, transition status.
    if (updated && updated.completedJobs + updated.failedJobs >= updated.totalJobs) {
      await db
        .update(bulkGenerationJobs)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(bulkGenerationJobs.id, payload.jobId));
    }

    await logAiCall({
      userId: payload.jobId, // workers don't have a user; log the job id in user_id slot
      feature: 'admin_generate_questions',
      provider: usedProvider,
      model: usedModel,
      wasFallback,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      succeeded: true,
    });

    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    if (err instanceof ProviderError) {
      usedProvider = err.provider;
    }
    await logAiCall({
      userId: payload.jobId,
      feature: 'admin_generate_questions',
      provider: usedProvider,
      model: usedModel,
      wasFallback,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - start,
      succeeded: false,
      errorCode: 'BULK_GEN_FAILED',
    });
    await markFailed(payload.jobId, String((err as Error)?.message ?? err).slice(0, 500));
    // 5xx so QStash retries the message.
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}

async function markFailed(jobId: string, note: string): Promise<void> {
  await db
    .update(bulkGenerationJobs)
    .set({
      failedJobs: sql`${bulkGenerationJobs.failedJobs} + 1`,
      notes: note,
    })
    .where(eq(bulkGenerationJobs.id, jobId));

  // If all sub-jobs are now done (whether failed or completed), close the parent.
  const [row] = await db
    .select({
      completedJobs: bulkGenerationJobs.completedJobs,
      failedJobs: bulkGenerationJobs.failedJobs,
      totalJobs: bulkGenerationJobs.totalJobs,
    })
    .from(bulkGenerationJobs)
    .where(eq(bulkGenerationJobs.id, jobId));
  if (row && row.completedJobs + row.failedJobs >= row.totalJobs) {
    await db
      .update(bulkGenerationJobs)
      .set({
        status: row.completedJobs > 0 ? 'completed' : 'failed',
        completedAt: new Date(),
      })
      .where(eq(bulkGenerationJobs.id, jobId));
  }
}
