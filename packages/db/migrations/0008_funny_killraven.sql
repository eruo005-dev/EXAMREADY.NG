CREATE TYPE "public"."bulk_generation_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."coverage_status" ADD VALUE 'beta' BEFORE 'coming_soon';--> statement-breakpoint
ALTER TYPE "public"."coverage_status" ADD VALUE 'hidden';--> statement-breakpoint
CREATE TABLE "bulk_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_by_user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"difficulty_distribution" jsonb NOT NULL,
	"target_count_per_topic" smallint NOT NULL,
	"total_jobs" integer DEFAULT 0 NOT NULL,
	"completed_jobs" integer DEFAULT 0 NOT NULL,
	"failed_jobs" integer DEFAULT 0 NOT NULL,
	"questions_generated" integer DEFAULT 0 NOT NULL,
	"status" "bulk_generation_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "theory_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"user_answer" text NOT NULL,
	"ai_response" jsonb NOT NULL,
	"provider" varchar(20) NOT NULL,
	"model" varchar(100) NOT NULL,
	"total_marks" smallint NOT NULL,
	"max_marks" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "marking_guide" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "max_marks" smallint;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "sample_excellent_answer" text;--> statement-breakpoint
CREATE INDEX "bulk_generation_status_idx" ON "bulk_generation_jobs" USING btree ("status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bulk_generation_started_by_idx" ON "bulk_generation_jobs" USING btree ("started_by_user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "theory_attempts_user_created_idx" ON "theory_attempts" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "theory_attempts_question_idx" ON "theory_attempts" USING btree ("question_id");