/**
 * Upstash Redis client — used for rate limiting, OTP request flags,
 * and per-user dashboard cache.
 *
 * Lazy init: building the client requires both REST URL and token. If
 * either is missing (e.g. local dev without Upstash), getRedis() returns
 * null and callers gracefully degrade (rate limiting is bypassed locally,
 * caches are skipped). Every consumer must handle null.
 */
import { Redis } from '@upstash/redis';

let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  cached = new Redis({ url, token });
  return cached;
}
