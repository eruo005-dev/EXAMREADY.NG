/**
 * AI telemetry helpers.
 *
 * The Anthropic-specific client wrapper that lived here previously moved
 * to lib/ai/providers/. Call sites now import { getProvider, runWithFallback,
 * AI_MODELS } from '@/lib/ai' (or the providers/constants modules directly).
 *
 * What stays here: the cross-provider telemetry sink (`logAiCall`) and
 * the daily-cap counter (`countAiCallsToday`). These don't care which
 * provider answered the call — the row records `provider` + `model` +
 * `wasFallback` so admin dashboards can break it down.
 */
import { aiUsageLog } from '@examready/db/schema';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '../db';
import { redactPii } from '../observability/pii';

import type { ProviderName } from './providers';

export class AiUnavailableError extends Error {
  readonly code = 'AI_UNAVAILABLE';
  constructor() {
    super('AI features are not configured on this deployment.');
  }
}

/**
 * Single point of telemetry for AI calls. Writes one row to ai_usage_log
 * per completed call. NEVER stores the prompt or user input.
 *
 * Output sample storage is OPT-IN via AI_LOG_SAMPLES=true. When enabled,
 * we store up to 4000 chars of the model's output text — PII-redacted
 * via redactPii — so /admin/ai-quality-review can spot-check Pidgin
 * register, register drift, etc. The flag is intentionally a runtime
 * env var and not a schema default: turning sampling on/off shouldn't
 * require a migration, AND the operator must affirmatively flip it
 * (visible in deployment config) to enable.
 */
export const AI_LOG_SAMPLES_ENABLED = (): boolean => process.env.AI_LOG_SAMPLES === 'true';

const MAX_SAMPLE_CHARS = 4000;

export async function logAiCall(args: {
  userId: string;
  feature: string;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  succeeded: boolean;
  /** True when the primary provider failed and the fallback handled the call. */
  wasFallback?: boolean;
  errorCode?: string;
  /** Model output. Stored only when AI_LOG_SAMPLES=true; redacted before insert. */
  outputText?: string;
}): Promise<string | null> {
  const { outputText, wasFallback, ...rest } = args;
  let outputSample: string | null = null;
  if (AI_LOG_SAMPLES_ENABLED() && outputText) {
    // Two layers: redact PII patterns in the text, then truncate. Order
    // matters — redact BEFORE truncating so we don't accidentally cut a
    // PII string in half and leave the prefix readable.
    const redacted = redactPii(outputText);
    outputSample = redacted.slice(0, MAX_SAMPLE_CHARS);
  }

  try {
    const inserted = await db
      .insert(aiUsageLog)
      .values({ ...rest, wasFallback: wasFallback ?? false, outputSample })
      .returning({ id: aiUsageLog.id });
    return inserted[0]?.id ?? null;
  } catch (err) {
    // Telemetry failure should never break the user-facing call. Log
    // through the existing PII-safe error path instead.
    // eslint-disable-next-line no-console
    console.error('[ai] usage log write failed:', redactPii({ err: String(err), args: rest }));
    return null;
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
