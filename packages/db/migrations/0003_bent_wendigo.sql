CREATE TABLE IF NOT EXISTS "consent_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"session_id" varchar(100),
	"decision" varchar(32) NOT NULL,
	"categories" jsonb,
	"user_agent" varchar(500),
	"ip_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_log_user_idx" ON "consent_log" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_log_session_idx" ON "consent_log" USING btree ("session_id","created_at" DESC NULLS LAST) WHERE "consent_log"."session_id" IS NOT NULL;