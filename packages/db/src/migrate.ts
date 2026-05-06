/**
 * Migration runner — orchestrates three sources in order:
 *
 * 1. migrations/local/*.sql   — only when LOCAL_DEV=true (auth schema stub).
 * 2. migrations/*.sql         — drizzle-kit generated, applied via Drizzle's
 *                               built-in migrator using _journal.json.
 * 3. migrations/extras/*.sql  — hand-written: FK to auth.users, updated_at
 *                               trigger, RLS policy stubs. Tracked in our
 *                               own _extras_applied table for idempotency.
 *
 * In production this script runs against Supabase (auth.users already exists
 * managed by GoTrue), so step 1 is skipped.
 */
import 'dotenv/config';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DIRECT_URL or DATABASE_URL must be set to run migrations');
}

const isLocal = process.env.LOCAL_DEV === 'true';
const migrationsRoot = resolve(__dirname, '../migrations');

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[migrate] ${msg}`);
};

async function applyLocalStub(sql: postgres.Sql): Promise<void> {
  const dir = resolve(migrationsRoot, 'local');
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    log(`local stub: ${file}`);
    const content = readFileSync(resolve(dir, file), 'utf8');
    await sql.unsafe(content);
  }
}

async function applyExtras(sql: postgres.Sql): Promise<void> {
  const dir = resolve(migrationsRoot, 'extras');
  if (!existsSync(dir)) return;

  // Track which extras have been applied — separate table from drizzle's
  // own __drizzle_migrations so we don't conflict with drizzle's bookkeeping.
  await sql`
    CREATE TABLE IF NOT EXISTS public._extras_applied (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const rows = await sql<{ count: number }[]>`
      SELECT count(*)::int FROM public._extras_applied WHERE filename = ${file}
    `;
    const count = rows[0]?.count ?? 0;
    if (count > 0) {
      log(`extra (skip — already applied): ${file}`);
      continue;
    }
    log(`extra: ${file}`);
    const content = readFileSync(resolve(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO public._extras_applied (filename) VALUES (${file})`;
    });
  }
}

async function run(): Promise<void> {
  const sql = postgres(url!, { max: 1, prepare: false });

  try {
    if (isLocal) {
      await applyLocalStub(sql);
    }

    log('Applying generated migrations…');
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: migrationsRoot });

    await applyExtras(sql);
    log('Done.');
  } finally {
    await sql.end();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
