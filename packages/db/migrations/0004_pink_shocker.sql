DO $$ BEGIN
 CREATE TYPE "public"."coverage_status" AS ENUM('live', 'coming_soon', 'planned');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_waitlist" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"exam_slug" varchar(80) NOT NULL,
	"source_url" varchar(500),
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "coverage_status" "coverage_status" DEFAULT 'live' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_waitlist_email_exam_unique" ON "exam_waitlist" USING btree ("email","exam_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_waitlist_exam_idx" ON "exam_waitlist" USING btree ("exam_slug","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_waitlist_pending_idx" ON "exam_waitlist" USING btree ("exam_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exams_coverage_idx" ON "exams" USING btree ("coverage_status");