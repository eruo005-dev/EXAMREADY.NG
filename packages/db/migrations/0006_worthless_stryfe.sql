CREATE TYPE "public"."ai_feedback_rating" AS ENUM('thumbs_up', 'thumbs_down');--> statement-breakpoint
CREATE TABLE "ai_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ai_usage_log_id" uuid NOT NULL,
	"rating" "ai_feedback_rating" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD COLUMN "output_sample" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_feedback_user_call_unique" ON "ai_feedback" USING btree ("user_id","ai_usage_log_id");--> statement-breakpoint
CREATE INDEX "ai_feedback_call_idx" ON "ai_feedback" USING btree ("ai_usage_log_id");--> statement-breakpoint
CREATE INDEX "ai_feedback_rating_idx" ON "ai_feedback" USING btree ("rating","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_samples_idx" ON "ai_usage_log" USING btree ("feature","created_at" DESC NULLS LAST) WHERE "ai_usage_log"."output_sample" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "target_exams" ADD CONSTRAINT "target_exams_priority_check" CHECK ("target_exams"."priority" BETWEEN 1 AND 3);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_age_check" CHECK ("users"."age" IS NULL OR ("users"."age" >= 13 AND "users"."age" <= 120));--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_frequency_check" CHECK ("topics"."frequency_score" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_difficulty_check" CHECK ("questions"."difficulty" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_frequency_check" CHECK ("questions"."frequency_score" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_total_check" CHECK ("attempts"."total_questions" > 0);--> statement-breakpoint
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_member_limit_check" CHECK ("study_groups"."member_limit" BETWEEN 2 AND 100);