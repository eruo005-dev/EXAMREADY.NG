ALTER TYPE "public"."attempt_mode" ADD VALUE 'cbt_mock_full';--> statement-breakpoint
ALTER TYPE "public"."attempt_mode" ADD VALUE 'cbt_mock_subject';--> statement-breakpoint
ALTER TYPE "public"."attempt_mode" ADD VALUE 'past_paper';--> statement-breakpoint
CREATE TABLE "exam_paper_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"question_count" smallint NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"total_marks" smallint NOT NULL,
	"allowed_question_types" jsonb DEFAULT '["mcq_single"]'::jsonb NOT NULL,
	"allows_comprehension" boolean DEFAULT false NOT NULL,
	"allows_theory" boolean DEFAULT false NOT NULL,
	"calculator_allowed" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "exam_paper_specs_exam_subject_idx" ON "exam_paper_specs" USING btree ("exam_id","subject_id");