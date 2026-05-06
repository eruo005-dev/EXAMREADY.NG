import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * consent_log — append-only audit trail of NDPR/GDPR consent choices.
 *
 * Required for compliance investigations: "what did this user consent to,
 * and when?" Each row is one consent action — Accept All, Reject Non-
 * Essential, or a Customize choice. user_id is nullable because anonymous
 * visitors also log consent (with session_id).
 *
 * categories is a jsonb map like { necessary: true, analytics: false,
 * advertising: false } — the granular customise breakdown. NULL when the
 * user picked Accept All / Reject Non-Essential without customising.
 */
export const consentLog = pgTable(
  'consent_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id'),
    sessionId: varchar('session_id', { length: 100 }),
    decision: varchar('decision', { length: 32 }).notNull(),
    categories: jsonb('categories'),
    userAgent: varchar('user_agent', { length: 500 }),
    ipHash: varchar('ip_hash', { length: 64 }), // SHA-256 of IP for compliance without storing raw IP
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('consent_log_user_idx').on(t.userId, t.createdAt.desc()),
    sessionIdx: index('consent_log_session_idx')
      .on(t.sessionId, t.createdAt.desc())
      .where(sql`${t.sessionId} IS NOT NULL`),
  }),
);

export type ConsentLogEntry = typeof consentLog.$inferSelect;
export type NewConsentLogEntry = typeof consentLog.$inferInsert;
