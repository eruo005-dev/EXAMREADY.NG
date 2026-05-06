/**
 * Test helpers — fresh schema per test suite.
 *
 * Strategy:
 * 1. Read the test database URL (TEST_DATABASE_URL > DATABASE_URL).
 * 2. Drop and recreate the `public` schema for isolation.
 * 3. Apply the local auth.users stub + drizzle-generated migrations + extras.
 *
 * Each test suite calls `setupTestDb()` in beforeAll and gets back a
 * Drizzle client + raw `postgres` client. Both are closed in afterAll.
 *
 * If no test DB URL is configured (CI without Postgres, local dev without
 * docker compose), tests should skip via the `skipIfNoDb` helper.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as relations from '../relations';
import * as schema from '../schema';

export type TestDb = {
  db: ReturnType<typeof drizzle<typeof schema & typeof relations>>;
  sql: postgres.Sql;
  close: () => Promise<void>;
};

export function getTestDbUrl(): string | null {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
}

export const skipIfNoDb = (): boolean => getTestDbUrl() === null;

const migrationsRoot = resolve(__dirname, '../../migrations');

async function applyLocalStub(sql: postgres.Sql): Promise<void> {
  const dir = resolve(migrationsRoot, 'local');
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await sql.unsafe(readFileSync(resolve(dir, file), 'utf8'));
  }
}

async function applyExtras(sql: postgres.Sql): Promise<void> {
  const dir = resolve(migrationsRoot, 'extras');
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await sql.unsafe(readFileSync(resolve(dir, file), 'utf8'));
  }
}

/**
 * Fresh schema. Drops public + auth schemas, re-creates, applies all
 * migrations. Tests share one DB instance per suite for speed.
 */
export async function setupTestDb(): Promise<TestDb> {
  const url = getTestDbUrl();
  if (!url) throw new Error('No test database URL configured');

  const sql = postgres(url, { max: 1, prepare: false });

  // Reset both public and auth schemas for clean slate.
  await sql.unsafe(`
    DROP SCHEMA IF EXISTS auth CASCADE;
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;
  `);

  // Drop our custom enums so re-creation in migrations doesn't conflict.
  // (DROP SCHEMA CASCADE handles types in public, but enums survive in
  //  some Postgres versions if explicitly created in another schema.)

  await applyLocalStub(sql);
  const db = drizzle(sql, { schema: { ...schema, ...relations } });
  await migrate(db, { migrationsFolder: migrationsRoot });
  await applyExtras(sql);

  return {
    db,
    sql,
    close: async () => {
      await sql.end();
    },
  };
}
