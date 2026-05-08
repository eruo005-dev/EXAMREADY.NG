CREATE TYPE "public"."lesson_status" AS ENUM('draft', 'review', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "topic_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" varchar(200) NOT NULL,
	"content_markdown" text NOT NULL,
	"content_html" text,
	"reading_time_minutes" smallint DEFAULT 5 NOT NULL,
	"prerequisite_topic_ids" jsonb,
	"worked_examples_count" smallint DEFAULT 0 NOT NULL,
	"status" "lesson_status" DEFAULT 'draft' NOT NULL,
	"generated_by_model" varchar(64),
	"approved_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_lesson_progress" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"bookmarked" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"progress_percent" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_lesson_progress_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_lesson_id_topic_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."topic_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "topic_lessons_topic_idx" ON "topic_lessons" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_lessons_slug_idx" ON "topic_lessons" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "topic_lessons_status_idx" ON "topic_lessons" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_lesson_progress_bookmark_idx" ON "user_lesson_progress" USING btree ("user_id","bookmarked");