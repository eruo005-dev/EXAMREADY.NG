import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @examready/db.
 *
 * Tests connect to TEST_DATABASE_URL (or DATABASE_URL as fallback) and
 * apply the full migration set on a fresh schema before each suite. Tests
 * are skipped automatically if no database URL is configured, so local
 * dev without docker compose doesn't break `pnpm test`.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
