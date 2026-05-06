import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Vitest config for apps/web.
 *
 * The cron handlers' library functions are unit-tested here. Tests that
 * need a live database use the same skip-if-no-db pattern as packages/db.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['lib/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
