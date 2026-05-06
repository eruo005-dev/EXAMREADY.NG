/**
 * Per-feature, per-tier daily quota for AI calls.
 *
 * Two-layer enforcement:
 * 1. Short-window throughput (Redis sliding window) — caps bursts so a
 *    runaway client can't fire 50 streaming chat requests in parallel.
 * 2. Daily cap by tier (durable, ai_usage_log) — the user-facing limit
 *    referenced in the pricing page (5/day tutor, etc.). The DB count
 *    is the authoritative gate; Redis just makes it cheap.
 *
 * Returning `nextAvailableAt` for daily-cap rejections lets the API
 * surface the tier-limit-exceeded UX with a real "available again at
 * midnight UTC" timestamp.
 */
import { Ratelimit } from '@upstash/ratelimit';

import { getRedis } from '../redis';

import { countAiCallsToday } from './client';

export type AiFeature = 'tutor_chat' | 'explain_differently' | 'study_plan';

export type TierKey = 'free' | 'basic' | 'pro';

export type AiQuotaResult =
  | { ok: true; remainingToday: number }
  | { ok: false; reason: 'rate_limited'; retryAfterSeconds: number }
  | {
      ok: false;
      reason: 'daily_cap_reached';
      cap: number;
      usedToday: number;
      nextAvailableAt: string; // ISO — start of next UTC day
    };

/**
 * Daily caps. Pro is unlimited per Sprint 3 spec; we model that as
 * Number.MAX_SAFE_INTEGER so the same code path handles all tiers.
 *
 * Basic tier sits between free and pro because the pricing page implies
 * a meaningful but not-unlimited boost. Numbers chosen to be defensible
 * but adjustable — admin can raise via app_settings later if usage data
 * shows we set them too low.
 */
const DAILY_CAPS: Record<AiFeature, Record<TierKey, number>> = {
  tutor_chat: {
    free: 5,
    basic: 50,
    pro: Number.MAX_SAFE_INTEGER,
  },
  explain_differently: {
    free: 10,
    basic: 100,
    pro: Number.MAX_SAFE_INTEGER,
  },
  study_plan: {
    free: 1,
    basic: 5,
    pro: Number.MAX_SAFE_INTEGER,
  },
};

/**
 * Short-window throughput limits (per user, regardless of tier). Even
 * pro users shouldn't be able to fire 1000 chat completions in 10
 * seconds — that's almost certainly abuse or a runaway loop.
 */
const THROUGHPUT_LIMITS: Record<AiFeature, { max: number; window: '10 s' | '1 m' }> = {
  tutor_chat: { max: 5, window: '10 s' },
  explain_differently: { max: 5, window: '10 s' },
  study_plan: { max: 2, window: '1 m' },
};

const throughputBuckets = new Map<AiFeature, Ratelimit>();

function getThroughputBucket(feature: AiFeature): Ratelimit | null {
  if (throughputBuckets.has(feature)) return throughputBuckets.get(feature)!;
  const redis = getRedis();
  if (!redis) return null;
  const cfg = THROUGHPUT_LIMITS[feature];
  const bucket = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.max, cfg.window),
  });
  throughputBuckets.set(feature, bucket);
  return bucket;
}

function startOfNextUtcDayIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d.toISOString();
}

export async function checkAiQuota(args: {
  userId: string;
  tier: TierKey;
  feature: AiFeature;
}): Promise<AiQuotaResult> {
  // Layer 1: throughput. Cheap fast-path; runs first so an abusive
  // client can't even reach the DB count query.
  const bucket = getThroughputBucket(args.feature);
  if (bucket) {
    const r = await bucket.limit(`ai:${args.feature}:${args.userId}`);
    if (!r.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
      return { ok: false, reason: 'rate_limited', retryAfterSeconds };
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Prod without Redis = misconfiguration. Fail closed.
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: 60 };
  }

  // Layer 2: daily cap. Database count is authoritative.
  const cap = DAILY_CAPS[args.feature][args.tier];
  if (cap !== Number.MAX_SAFE_INTEGER) {
    const usedToday = await countAiCallsToday(args.userId, args.feature);
    if (usedToday >= cap) {
      return {
        ok: false,
        reason: 'daily_cap_reached',
        cap,
        usedToday,
        nextAvailableAt: startOfNextUtcDayIso(),
      };
    }
    return { ok: true, remainingToday: cap - usedToday };
  }

  return { ok: true, remainingToday: Number.MAX_SAFE_INTEGER };
}
