import { sql } from 'drizzle-orm';
import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * app_settings — tiny key/value store for ops-controllable runtime flags.
 *
 * Sprint 1 use: the AdSense kill switch (`ads_enabled`). If Google flags
 * our AdSense account, an admin can flip this from the dashboard without
 * requiring a deploy.
 *
 * key is the natural primary key (e.g. 'ads_enabled', 'maintenance_mode').
 * value is jsonb so we can store booleans, numbers, or small JSON objects.
 *
 * Don't bloat this table — it's not a CMS. New use cases get their own
 * table once they grow more than a couple of fields.
 */
export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull().default(sql`'null'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: uuid('updated_by_user_id'),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
