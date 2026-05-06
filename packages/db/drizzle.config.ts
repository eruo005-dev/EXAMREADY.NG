import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DIRECT_URL or DATABASE_URL must be set for drizzle-kit');
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
  // The auth-link migration (FK to auth.users + trigger) is hand-written and
  // committed alongside the generated migrations. We never want drizzle-kit
  // to drop or recreate it on subsequent generates.
  schemaFilter: ['public'],
});
