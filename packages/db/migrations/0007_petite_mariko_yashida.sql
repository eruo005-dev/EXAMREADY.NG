ALTER TABLE "ai_usage_log" ADD COLUMN "provider" varchar(20) DEFAULT 'anthropic' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "was_fallback" boolean DEFAULT false NOT NULL;