ALTER TABLE "users" ADD COLUMN "streak_days" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_date" date;