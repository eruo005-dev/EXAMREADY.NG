/**
 * POST /api/ai/feedback
 *
 * Records a thumbs-up/down on a prior AI output. Linked to ai_usage_log
 * via ai_usage_log_id so we can compute per-feature thumbs ratios.
 *
 * Idempotent on (user_id, ai_usage_log_id) — if a user clicks thumbs-down
 * then changes to thumbs-up, we UPDATE the existing row. UNIQUE
 * constraint enforces one feedback per call per user.
 *
 * Rate limit: 'user' bucket (120/min) — thumbs is cheap; spam is bounded
 * by the UNIQUE constraint anyway.
 */
import { aiFeedback, aiUsageLog } from '@examready/db/schema';
import { aiFeedbackInputSchema } from '@examready/shared';
import { and, eq } from 'drizzle-orm';

import { defineRoute, ForbiddenError, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'user',
  bodySchema: aiFeedbackInputSchema,
})(async ({ parsed, user }) => {
  if (!user) throw new Error('user required');

  // Verify the ai_usage_log row (a) exists and (b) belongs to this user.
  // Letting any signed-in user vote on any other user's AI call would
  // poison the quality signal AND leak the existence of other users'
  // calls. Tight ownership check.
  const [logRow] = await db
    .select({ id: aiUsageLog.id, userId: aiUsageLog.userId })
    .from(aiUsageLog)
    .where(eq(aiUsageLog.id, parsed.aiUsageLogId))
    .limit(1);

  if (!logRow) throw new NotFoundError('AI call not found');
  if (logRow.userId !== user.profile.id) {
    throw new ForbiddenError('You can only rate your own AI calls.');
  }

  // Upsert: if user has already rated this call, toggle/update.
  await db
    .insert(aiFeedback)
    .values({
      userId: user.profile.id,
      aiUsageLogId: parsed.aiUsageLogId,
      rating: parsed.rating,
      comment: parsed.comment,
    })
    .onConflictDoUpdate({
      target: [aiFeedback.userId, aiFeedback.aiUsageLogId],
      set: {
        rating: parsed.rating,
        comment: parsed.comment,
        updatedAt: new Date(),
      },
    });

  return ok({ recorded: true, rating: parsed.rating });
});

/**
 * GET /api/ai/feedback?aiUsageLogId=...
 *
 * Returns the current user's feedback for a given AI call (or null).
 * Used by the frontend to render the existing thumbs state on revisit.
 */
export const GET = defineRoute({ auth: 'user' })(async ({ req, user }) => {
  if (!user) throw new Error('user required');
  const url = new URL(req.url);
  const aiUsageLogId = url.searchParams.get('aiUsageLogId');
  if (!aiUsageLogId || !/^[0-9a-f-]{36}$/i.test(aiUsageLogId)) {
    throw new NotFoundError('AI call not found');
  }

  const [row] = await db
    .select({ rating: aiFeedback.rating, comment: aiFeedback.comment })
    .from(aiFeedback)
    .where(and(eq(aiFeedback.userId, user.profile.id), eq(aiFeedback.aiUsageLogId, aiUsageLogId)))
    .limit(1);

  return ok({ feedback: row ?? null });
});
