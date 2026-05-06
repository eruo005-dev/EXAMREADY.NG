/**
 * Anthropic client wrapper.
 *
 * Lazy-initialized — `getAnthropic()` returns null when ANTHROPIC_API_KEY
 * is unset (local dev, CI without secrets) so callers can degrade
 * gracefully instead of crashing on module load.
 *
 * Model selection by feature is intentional and visible at call site —
 * NOT abstracted into a "default model" because Sonnet vs Haiku is a
 * cost/quality tradeoff that should be explicit per call:
 *
 *   - tutor chat (streaming, multi-turn, deeper reasoning)  → Sonnet 4.6
 *   - explain-differently (short, fast, single-shot)         → Haiku 4.5
 *   - study-plan generation (structured JSON, long context)  → Sonnet 4.6
 *   - admin question generation (10 at once, accuracy-bound) → Sonnet 4.6
 *
 * Haiku 4.5 is ~3x cheaper than Sonnet 4.6 — using it for explain-
 * differently keeps that feature affordable for free-tier users.
 */
import Anthropic from '@anthropic-ai/sdk';
import { aiUsageLog } from '@examready/db/schema';
import { and, eq, sql } from 'drizzle-orm';


import { db } from '../db';
import { redactPii } from '../observability/pii';

export const AI_MODELS = {
  tutorChat: 'claude-sonnet-4-6',
  explainDifferently: 'claude-haiku-4-5-20251001',
  studyPlan: 'claude-sonnet-4-6',
  generateQuestions: 'claude-sonnet-4-6',
} as const;

let cached: Anthropic | null | undefined;

export function getAnthropic(): Anthropic | null {
  if (cached !== undefined) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Anthropic({ apiKey: key });
  return cached;
}

export class AiUnavailableError extends Error {
  readonly code = 'AI_UNAVAILABLE';
  constructor() {
    super('AI features are not configured on this deployment.');
  }
}

/**
 * Single point of telemetry for AI calls. Writes one row to ai_usage_log
 * per completed call. NEVER stores the prompt or completion body — only
 * counts + duration + success/error.
 */
export async function logAiCall(args: {
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  succeeded: boolean;
  errorCode?: string;
}): Promise<void> {
  try {
    await db.insert(aiUsageLog).values(args);
  } catch (err) {
    // Telemetry failure should never break the user-facing call. Log
    // through the existing PII-safe error path instead.
    // eslint-disable-next-line no-console
    console.error('[ai] usage log write failed:', redactPii({ err: String(err), args }));
  }
}

/**
 * Count how many times this user has used a given feature today (UTC day).
 * Used by the rate-limit logic in addition to Redis sliding-window —
 * Redis can drop a request budget on restart, the database can't.
 *
 * Used as the AUTHORITATIVE check for the daily-cap enforcement; Redis
 * just makes it fast.
 */
export async function countAiCallsToday(userId: string, feature: string): Promise<number> {
  // Index ai_usage_user_feature_day_idx makes this a fast range scan.
  // "Today" is UTC-day for now — the daily cap is approximate enough that
  // a couple of timezone edge minutes don't matter; tightening to user.tz
  // would require joining users and complicates the rate-limit hot path.
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiUsageLog)
    .where(
      and(
        eq(aiUsageLog.userId, userId),
        eq(aiUsageLog.feature, feature),
        sql`${aiUsageLog.createdAt} >= date_trunc('day', now())`,
      ),
    );
  return rows[0]?.count ?? 0;
}
