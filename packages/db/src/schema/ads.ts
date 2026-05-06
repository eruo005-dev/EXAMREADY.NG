import {
  bigserial,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * ad_impressions — first-party ad analytics, not AdSense's own.
 *
 * Uses bigserial PK because this table will dominate row counts at scale
 * (every page view from a free-tier user produces 1+ impression). bigint
 * indexes are ~4x more compact than uuid. Will be partitioned by month
 * later if volume warrants — not needed in Sprint 0.
 */
export const adImpressions = pgTable(
  'ad_impressions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id'),
    placement: varchar('placement', { length: 50 }).notNull(),
    sessionId: varchar('session_id', { length: 100 }),
    impressionAt: timestamp('impression_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    impressionAtIdx: index('ad_impressions_at_idx').on(t.impressionAt.desc()),
    userIdx: index('ad_impressions_user_idx').on(t.userId, t.impressionAt.desc()),
    placementIdx: index('ad_impressions_placement_idx').on(t.placement, t.impressionAt.desc()),
  }),
);

export type AdImpression = typeof adImpressions.$inferSelect;
export type NewAdImpression = typeof adImpressions.$inferInsert;
