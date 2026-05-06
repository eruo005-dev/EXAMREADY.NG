import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as relations from './relations';
import * as schema from './schema';

export type Database = ReturnType<typeof createDb>;

/**
 * Creates a Drizzle client.
 *
 * In serverless environments (Vercel), each function invocation reuses a
 * cached connection thanks to module-level memoization in lib/db.ts. The
 * `prepare: false` flag is required for Supabase's PgBouncer transaction
 * pooler — prepared statements aren't safe across pooled connections.
 */
export function createDb(connectionString: string) {
  const queryClient = postgres(connectionString, {
    prepare: false,
    max: process.env.NODE_ENV === 'production' ? 1 : 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

  return drizzle(queryClient, {
    schema: { ...schema, ...relations },
    logger: process.env.NODE_ENV === 'development',
  });
}
