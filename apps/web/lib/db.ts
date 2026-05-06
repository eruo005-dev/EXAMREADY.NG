/**
 * THE single Drizzle client used by every API route.
 *
 * Module-level memoisation is critical on Vercel: each warm function
 * invocation reuses this connection rather than spawning a new pool. A
 * cold start creates one connection; subsequent requests share it.
 *
 * `prepare: false` is required when DATABASE_URL points at Supabase's
 * transaction pooler (port 6543) — prepared statements aren't safe across
 * pooled connections. Locally (port 5432) it's harmless overhead.
 */
import { createDb } from '@examready/db/client';

const url = process.env.DATABASE_URL;
if (!url) {
  // Throw at module load so misconfigured deployments fail fast and loud.
  throw new Error('DATABASE_URL is not set');
}

export const db = createDb(url);

export type Db = typeof db;
