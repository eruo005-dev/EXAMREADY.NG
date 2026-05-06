/**
 * Locks in: users.email UNIQUE allows multiple NULL values.
 *
 * Drizzle's `.unique()` should emit plain UNIQUE (Postgres default
 * "NULLS DISTINCT" — many NULLs allowed). If a future Drizzle version
 * starts emitting NULLS NOT DISTINCT, this test fails loud — phone-only
 * signups (the majority of Nigerian students) would otherwise silently
 * conflict on the second user.
 *
 * Verified in CHECKPOINT 2 follow-up #1.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { setupTestDb, skipIfNoDb, type TestDb } from './helpers';

const itOrSkip = skipIfNoDb() ? test.skip : test;

describe('users.email UNIQUE accepts multiple NULLs', () => {
  let ctx: TestDb;

  beforeAll(async () => {
    if (skipIfNoDb()) return;
    ctx = await setupTestDb();
  });

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  itOrSkip('two phone-only signups (no email) both succeed', async () => {
    // Two distinct auth.users rows, both with email=NULL. The trigger
    // creates matching public.users rows. UNIQUE on public.users.email
    // must allow both NULLs (NULLS DISTINCT default).
    const aliceId = await ctx.sql<{ id: string }[]>`
      INSERT INTO auth.users (phone) VALUES (${'+2348011111111'}) RETURNING id
    `.then((r) => r[0]!.id);

    const bobId = await ctx.sql<{ id: string }[]>`
      INSERT INTO auth.users (phone) VALUES (${'+2348022222222'}) RETURNING id
    `.then((r) => r[0]!.id);

    const rows = await ctx.sql<{ id: string; email: string | null }[]>`
      SELECT id, email FROM public.users WHERE id IN (${aliceId}, ${bobId})
    `;

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.email === null)).toBe(true);
  });

  itOrSkip('explicitly inserting two NULL emails via UPDATE does not conflict', async () => {
    // Belt-and-suspenders: simulate the user_role flow where email may be
    // explicitly set to NULL on an existing row, and another user later
    // does the same. NULLS DISTINCT means no UNIQUE violation.
    const id1 = await ctx.sql<{ id: string }[]>`
      INSERT INTO auth.users (phone) VALUES (${'+2348033333333'}) RETURNING id
    `.then((r) => r[0]!.id);
    const id2 = await ctx.sql<{ id: string }[]>`
      INSERT INTO auth.users (phone) VALUES (${'+2348044444444'}) RETURNING id
    `.then((r) => r[0]!.id);

    // Both inserts already have NULL email (trigger took NEW.email which
    // was NULL). Issue an UPDATE setting NULL again — must not conflict.
    await ctx.sql`UPDATE public.users SET email = NULL WHERE id = ${id1}`;
    await ctx.sql`UPDATE public.users SET email = NULL WHERE id = ${id2}`;

    const rows = await ctx.sql<{ count: number }[]>`
      SELECT count(*)::int as count FROM public.users WHERE email IS NULL
    `;
    expect(rows[0]!.count).toBeGreaterThanOrEqual(2);
  });

  itOrSkip('updating two public.users rows to the same non-NULL email DOES conflict', async () => {
    // Sanity check: the public.users.email UNIQUE constraint actually works
    // for non-NULL values. Insert into auth.users with NULL email (so the
    // trigger creates rows with NULL email), then UPDATE public.users
    // directly to set both rows to the same email.
    const id1 = await ctx.sql<{ id: string }[]>`
      INSERT INTO auth.users (phone) VALUES (${'+2348055555555'}) RETURNING id
    `.then((r) => r[0]!.id);
    const id2 = await ctx.sql<{ id: string }[]>`
      INSERT INTO auth.users (phone) VALUES (${'+2348066666666'}) RETURNING id
    `.then((r) => r[0]!.id);

    await ctx.sql`UPDATE public.users SET email = ${'duplicate@example.com'} WHERE id = ${id1}`;
    await expect(
      ctx.sql`UPDATE public.users SET email = ${'duplicate@example.com'} WHERE id = ${id2}`,
    ).rejects.toThrow(/duplicate|unique/i);
  });
});
