import { sql } from 'drizzle-orm';

import { defineRoute, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

async function pingDb(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

async function pingRedis(): Promise<{ ok: boolean; latencyMs: number }> {
  const redis = getRedis();
  if (!redis) return { ok: process.env.NODE_ENV !== 'production', latencyMs: 0 };
  const start = Date.now();
  try {
    await redis.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export const GET = defineRoute({
  auth: 'public',
})(async () => {
  const [dbStatus, redisStatus] = await Promise.all([pingDb(), pingRedis()]);
  const allOk = dbStatus.ok && redisStatus.ok;
  return ok(
    {
      ok: allOk,
      db: dbStatus,
      redis: redisStatus,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    },
    { status: allOk ? 200 : 503 },
  );
});
