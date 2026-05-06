/**
 * GET /api/admin/ai-quality
 *
 * Surface for /admin/ai-quality-review. Returns:
 *   - aggregate counts per feature for a 14-day window (calls, thumbs ratio,
 *     redacted-sample availability)
 *   - a paginated list of recent samples for spot-check (only present when
 *     AI_LOG_SAMPLES was set when the call happened — older entries return
 *     null for `outputSample`)
 *
 * The Pidgin variant is the moat; we read this surface to confirm register
 * stays authentic and the thumbs ratio stays > 0.7. If samples come back
 * empty, the admin needs to flip AI_LOG_SAMPLES=true on the deployment for
 * a sampling window then turn it off again.
 */
import { aiFeedback, aiUsageLog } from '@examready/db/schema';
import { and, desc, eq, gte, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';

import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FEATURES = ['explain_differently', 'tutor_chat', 'study_plan', 'generate_questions'] as const;
const WINDOW_DAYS = 14;

export const GET = defineRoute({ auth: 'admin' })(async ({ req }) => {
  const url = new URL(req.url);
  const feature = url.searchParams.get('feature') ?? 'explain_differently';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const fallbackOnly = url.searchParams.get('fallbackOnly') === 'true';
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Aggregate counts per (feature, provider) in the window so the UI can
  // show the hybrid split (DeepSeek vs Anthropic per feature) and the
  // fallback ratio.
  const summaryRows = await db
    .select({
      feature: aiUsageLog.feature,
      provider: aiUsageLog.provider,
      calls: sql<number>`count(*)::int`,
      succeeded: sql<number>`count(*) filter (where ${aiUsageLog.succeeded} = true)::int`,
      withSample: sql<number>`count(*) filter (where ${aiUsageLog.outputSample} is not null)::int`,
      fallbacks: sql<number>`count(*) filter (where ${aiUsageLog.wasFallback} = true)::int`,
    })
    .from(aiUsageLog)
    .where(gte(aiUsageLog.createdAt, since))
    .groupBy(aiUsageLog.feature, aiUsageLog.provider);

  // Thumbs counts per feature, joined back via aiUsageLogId.
  const thumbsRows = await db
    .select({
      feature: aiUsageLog.feature,
      up: sql<number>`count(*) filter (where ${aiFeedback.rating} = 'thumbs_up')::int`,
      down: sql<number>`count(*) filter (where ${aiFeedback.rating} = 'thumbs_down')::int`,
    })
    .from(aiFeedback)
    .innerJoin(aiUsageLog, eq(aiUsageLog.id, aiFeedback.aiUsageLogId))
    .where(gte(aiFeedback.createdAt, since))
    .groupBy(aiUsageLog.feature);

  const thumbsByFeature = new Map(thumbsRows.map((r) => [r.feature, r]));
  const summary = FEATURES.map((f) => {
    const featureRows = summaryRows.filter((r) => r.feature === f);
    const calls = featureRows.reduce((s, r) => s + r.calls, 0);
    const succeeded = featureRows.reduce((s, r) => s + r.succeeded, 0);
    const withSample = featureRows.reduce((s, r) => s + r.withSample, 0);
    const fallbacks = featureRows.reduce((s, r) => s + r.fallbacks, 0);
    const t = thumbsByFeature.get(f);
    const up = t?.up ?? 0;
    const down = t?.down ?? 0;
    const totalRated = up + down;
    return {
      feature: f,
      calls,
      succeeded,
      withSample,
      fallbacks,
      // Per-provider breakdown so the UI can render "DeepSeek 320 / Anthropic 12".
      byProvider: featureRows.map((r) => ({
        provider: r.provider,
        calls: r.calls,
        succeeded: r.succeeded,
        fallbacks: r.fallbacks,
      })),
      thumbsUp: up,
      thumbsDown: down,
      thumbsRatio: totalRated > 0 ? up / totalRated : null,
    };
  });

  // Recent samples for the requested feature.
  const samples = await db
    .select({
      id: aiUsageLog.id,
      feature: aiUsageLog.feature,
      provider: aiUsageLog.provider,
      model: aiUsageLog.model,
      wasFallback: aiUsageLog.wasFallback,
      createdAt: aiUsageLog.createdAt,
      durationMs: aiUsageLog.durationMs,
      inputTokens: aiUsageLog.inputTokens,
      outputTokens: aiUsageLog.outputTokens,
      outputSample: aiUsageLog.outputSample,
    })
    .from(aiUsageLog)
    .where(
      and(
        ...([
          eq(aiUsageLog.feature, feature),
          isNotNull(aiUsageLog.outputSample),
          gte(aiUsageLog.createdAt, since),
          fallbackOnly ? eq(aiUsageLog.wasFallback, true) : undefined,
        ].filter(Boolean) as SQL[]),
      ),
    )
    .orderBy(desc(aiUsageLog.createdAt))
    .limit(limit);

  // Attach feedback to each sample (left join, may be null).
  const sampleIds = samples.map((s) => s.id);
  const feedbackRows = sampleIds.length
    ? await db
        .select({
          aiUsageLogId: aiFeedback.aiUsageLogId,
          rating: aiFeedback.rating,
          comment: aiFeedback.comment,
        })
        .from(aiFeedback)
        .where(inArray(aiFeedback.aiUsageLogId, sampleIds))
    : [];
  const feedbackByCall = new Map(feedbackRows.map((r) => [r.aiUsageLogId, r]));

  return ok({
    windowDays: WINDOW_DAYS,
    samplingEnabled: process.env.AI_LOG_SAMPLES === 'true',
    summary,
    samples: samples.map((s) => ({
      ...s,
      feedback: feedbackByCall.get(s.id) ?? null,
    })),
  });
});
