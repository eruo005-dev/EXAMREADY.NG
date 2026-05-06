/**
 * Rate-limit kinds and bucket configuration.
 *
 * Limits by kind:
 *   public  — 60 req / IP / minute
 *   user    — 120 req / user / minute
 *   admin   — 300 req / user / minute
 *   auth    — composite: 5 OTP requests / phone / 10min AND 20 / IP / hour
 *   answer  — 1200 req / user / minute (mock CBT fast-paced answering)
 *   bypass  — no limit (cron, webhooks)
 *
 * If Upstash Redis isn't configured (local dev without UPSTASH_*), the
 * limiter degrades to "always allow" so dev isn't blocked.
 */
import { Ratelimit } from '@upstash/ratelimit';

import { getRedis } from './redis';

export type RateLimitKind = 'public' | 'user' | 'admin' | 'auth' | 'answer' | 'bypass';

export type RateLimitResult = {
  ok: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
};

type Bucket = { limiter: Ratelimit; keyBuilder: (key: string) => string };

const buckets = new Map<string, Bucket>();

function makeBucket(name: string, limiter: Ratelimit, keyPrefix: string): Bucket {
  const bucket = { limiter, keyBuilder: (key: string) => `${keyPrefix}:${key}` };
  buckets.set(name, bucket);
  return bucket;
}

function getBucket(name: string): Bucket | null {
  if (buckets.has(name)) return buckets.get(name)!;
  const redis = getRedis();
  if (!redis) return null;

  switch (name) {
    case 'public':
      return makeBucket(name, new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m') }), 'rl:pub');
    case 'user':
      return makeBucket(name, new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '1 m') }), 'rl:usr');
    case 'admin':
      return makeBucket(name, new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(300, '1 m') }), 'rl:adm');
    case 'answer':
      return makeBucket(name, new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(1200, '1 m') }), 'rl:ans');
    case 'auth-phone':
      return makeBucket(name, new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '10 m') }), 'rl:auth:p');
    case 'auth-ip':
      return makeBucket(name, new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '1 h') }), 'rl:auth:i');
    case 'auth-verify':
      return makeBucket(name, new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '10 m') }), 'rl:auth:v');
    case 'auth-resend':
      return makeBucket(name, new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '10 m') }), 'rl:auth:r');
  }
  return null;
}

/**
 * Check a single bucket. Returns ok=true if allowed (or if Upstash not
 * configured and we're in local dev).
 */
async function check(bucketName: string, key: string): Promise<RateLimitResult> {
  const bucket = getBucket(bucketName);
  if (!bucket) {
    if (process.env.NODE_ENV === 'production') {
      // In prod, missing Upstash is a real failure — fail closed.
      return { ok: false, retryAfterSeconds: 60 };
    }
    return { ok: true };
  }
  const result = await bucket.limiter.limit(bucket.keyBuilder(key));
  if (result.success) {
    return { ok: true, remaining: result.remaining };
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { ok: false, retryAfterSeconds, remaining: 0 };
}

/**
 * Apply the rate-limit kind for an incoming request.
 *
 * Composite kinds (auth) check multiple buckets — both must pass.
 */
export async function applyRateLimit(
  kind: RateLimitKind,
  ctx: { ip: string; userId?: string; phone?: string; verifyContext?: 'verify' | 'resend' },
): Promise<RateLimitResult> {
  switch (kind) {
    case 'bypass':
      return { ok: true };
    case 'public':
      return check('public', ctx.ip);
    case 'user':
      return check('user', ctx.userId ?? ctx.ip);
    case 'admin':
      return check('admin', ctx.userId ?? ctx.ip);
    case 'answer':
      return check('answer', ctx.userId ?? ctx.ip);
    case 'auth': {
      // Composite: check both phone AND IP (or verify-specific bucket).
      if (ctx.verifyContext === 'verify') return check('auth-verify', ctx.phone ?? ctx.ip);
      if (ctx.verifyContext === 'resend') return check('auth-resend', ctx.phone ?? ctx.ip);
      const phoneCheck = ctx.phone ? await check('auth-phone', ctx.phone) : { ok: true };
      if (!phoneCheck.ok) return phoneCheck;
      const ipCheck = await check('auth-ip', ctx.ip);
      return ipCheck;
    }
  }
}
