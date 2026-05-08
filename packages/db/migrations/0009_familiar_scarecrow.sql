CREATE TYPE "public"."audit_verdict" AS ENUM('auto_approved', 'needs_review', 'rejected_by_audit', 'human_approved', 'human_rejected');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('queued', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."ingestion_pipeline" AS ENUM('questions', 'syllabus', 'university', 'cutoff', 'course-combinations', 'reference');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('queued', 'parsing', 'enriching', 'auditing', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."reference_content_kind" AS ENUM('study-notes', 'exam-information', 'syllabus-text', 'reference-article');--> statement-breakpoint
CREATE TYPE "public"."university_type" AS ENUM('federal', 'state', 'private', 'polytechnic-federal', 'polytechnic-state', 'polytechnic-private', 'monotechnic', 'college-of-education', 'innovation-enterprise-institution', 'specialised', 'other');--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text,
	"duration_years" smallint,
	"jamb_subject_combination" jsonb,
	"olevel_requirements" jsonb,
	"career_paths" jsonb,
	"source_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cutoff_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"university_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"cutoff_score" smallint,
	"aggregate_cutoff" smallint,
	"notes" text,
	"source_url" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_pipeline" "ingestion_pipeline" NOT NULL,
	"target_table" varchar(64) NOT NULL,
	"target_id" uuid NOT NULL,
	"confidence_overall" smallint NOT NULL,
	"dimensions" jsonb,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning" text,
	"verdict" "audit_verdict" NOT NULL,
	"audit_model" varchar(64) NOT NULL,
	"audit_cost_usd" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"audit_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"source_kind" varchar(16) NOT NULL,
	"status" "extraction_status" DEFAULT 'queued' NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"text_bytes" integer DEFAULT 0 NOT NULL,
	"used_vision" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_job_id" uuid NOT NULL,
	"pipeline" "ingestion_pipeline" NOT NULL,
	"status" "ingestion_status" DEFAULT 'queued' NOT NULL,
	"rows_produced" integer DEFAULT 0 NOT NULL,
	"cost_usd" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "reference_content_kind" NOT NULL,
	"title" text NOT NULL,
	"slug" varchar(200),
	"topic_id" uuid,
	"exam_id" uuid,
	"content" text NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"source_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraping_cache" (
	"url" text PRIMARY KEY NOT NULL,
	"status_code" smallint NOT NULL,
	"body" text NOT NULL,
	"content_type" varchar(200),
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "universities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(120) NOT NULL,
	"full_name" text,
	"type" "university_type" NOT NULL,
	"state" varchar(50) NOT NULL,
	"website" text,
	"jamb_code" varchar(12),
	"established_year" smallint,
	"accreditation_status" varchar(20),
	"logo_url" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "university_courses" (
	"university_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"faculty" text,
	"department" text,
	"jamb_subject_combination_override" jsonb,
	"olevel_requirements_override" jsonb,
	"source_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "university_courses_university_id_course_id_pk" PRIMARY KEY("university_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "cutoff_marks" ADD CONSTRAINT "cutoff_marks_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cutoff_marks" ADD CONSTRAINT "cutoff_marks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_extraction_job_id_extraction_jobs_id_fk" FOREIGN KEY ("extraction_job_id") REFERENCES "public"."extraction_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "university_courses" ADD CONSTRAINT "university_courses_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "university_courses" ADD CONSTRAINT "university_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug_idx" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "courses_name_idx" ON "courses" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "cutoff_marks_uniq_idx" ON "cutoff_marks" USING btree ("university_id","course_id","year");--> statement-breakpoint
CREATE INDEX "cutoff_marks_year_idx" ON "cutoff_marks" USING btree ("year");--> statement-breakpoint
CREATE INDEX "editorial_audit_target_idx" ON "editorial_audit_log" USING btree ("target_table","target_id");--> statement-breakpoint
CREATE INDEX "editorial_audit_verdict_idx" ON "editorial_audit_log" USING btree ("verdict","audit_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "editorial_audit_pipeline_idx" ON "editorial_audit_log" USING btree ("source_pipeline","audit_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_jobs_source_key_idx" ON "extraction_jobs" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "extraction_jobs_status_idx" ON "extraction_jobs" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ingestion_jobs_extraction_idx" ON "ingestion_jobs" USING btree ("extraction_job_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ingestion_jobs_pipeline_idx" ON "ingestion_jobs" USING btree ("pipeline","status");--> statement-breakpoint
CREATE INDEX "reference_content_kind_idx" ON "reference_content" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "reference_content_topic_idx" ON "reference_content" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "reference_content_slug_idx" ON "reference_content" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "scraping_cache_fetched_at_idx" ON "scraping_cache" USING btree ("fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "universities_slug_idx" ON "universities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "universities_state_idx" ON "universities" USING btree ("state");--> statement-breakpoint
CREATE INDEX "universities_type_idx" ON "universities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "university_courses_course_idx" ON "university_courses" USING btree ("course_id");