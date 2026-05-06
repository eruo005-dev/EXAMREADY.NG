/**
 * Vitest setup — runs once before any test in this package.
 *
 * Loads .env (via dotenv) so TEST_DATABASE_URL / DATABASE_URL is available.
 * Individual tests use the helpers in ./helpers.ts to get a fresh schema.
 */
import { resolve } from 'node:path';

import 'dotenv/config';
import { config } from 'dotenv';

// Load .env.test if present, falling back to .env. Allows CI to override
// without touching the dev .env.
config({ path: resolve(__dirname, '../../.env.test'), override: false });
