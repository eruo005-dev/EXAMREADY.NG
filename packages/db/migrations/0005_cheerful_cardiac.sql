CREATE TABLE IF NOT EXISTS "ai_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"succeeded" boolean DEFAULT true NOT NULL,
	"error_code" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"exam_date" date,
	"hours_per_week" smallint NOT NULL,
	"weak_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan" jsonb NOT NULL,
	"generation_input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_by_model" varchar(100) NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "generated_by_model" varchar(100);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_user_feature_day_idx" ON "ai_usage_log" USING btree ("user_id","feature","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_feature_idx" ON "ai_usage_log" USING btree ("feature","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "study_plans_user_current_unique" ON "study_plans" USING btree ("user_id","exam_id") WHERE "study_plans"."is_current" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_plans_user_created_idx" ON "study_plans" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_moderation_queue_idx" ON "questions" USING btree ("created_at" DESC NULLS LAST) WHERE "questions"."generated_by_model" IS NOT NULL AND "questions"."is_active" = false;