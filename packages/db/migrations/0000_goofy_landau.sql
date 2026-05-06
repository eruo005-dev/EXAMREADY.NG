DO $$ BEGIN
 CREATE TYPE "public"."attempt_mode" AS ENUM('quick_practice', 'topic_drill', 'past_year', 'mock_cbt', 'adaptive', 'flashcard');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."group_role" AS ENUM('owner', 'member');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_channel" AS ENUM('whatsapp', 'sms', 'email', 'push');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_status" AS ENUM('pending', 'success', 'failed', 'refunded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."question_type" AS ENUM('mcq_single', 'mcq_multi', 'true_false', 'fill_blank', 'theory', 'comprehension', 'diagram');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."referral_status" AS ENUM('pending', 'qualified', 'rewarded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."subscription_plan" AS ENUM('basic_monthly', 'pro_monthly', 'pro_annual');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'cancelled', 'grace', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."subscription_tier" AS ENUM('free', 'basic', 'pro');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "target_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"exam_date" date,
	"subject_combination" jsonb,
	"priority" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(320),
	"full_name" varchar(200),
	"age" smallint,
	"state" varchar(50),
	"school" varchar(200),
	"subscription_tier" "subscription_tier" DEFAULT 'free' NOT NULL,
	"subscription_expires_at" timestamp with time zone,
	"whatsapp_opted_in" boolean DEFAULT true NOT NULL,
	"sms_opted_in" boolean DEFAULT true NOT NULL,
	"email_opted_in" boolean DEFAULT true NOT NULL,
	"preferred_notification_time" time DEFAULT '18:00:00' NOT NULL,
	"timezone" varchar(50) DEFAULT 'Africa/Lagos' NOT NULL,
	"parent_user_id" uuid,
	"referral_code" varchar(20) NOT NULL,
	"referred_by_user_id" uuid,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"description" text,
	"icon_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"icon_url" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"parent_topic_id" uuid,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"frequency_score" smallint DEFAULT 50 NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" varchar(2) NOT NULL,
	"content" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"question_type" "question_type" NOT NULL,
	"stem" text NOT NULL,
	"passage" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty" smallint NOT NULL,
	"year" smallint,
	"source" varchar(100),
	"explanation" text NOT NULL,
	"frequency_score" smallint DEFAULT 50 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"search_text" text GENERATED ALWAYS AS (stem || ' ' || COALESCE(passage, '') || ' ' || COALESCE(explanation, '')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option_ids" jsonb,
	"text_answer" text,
	"is_correct" boolean,
	"time_spent_seconds" integer,
	"flagged" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" "attempt_mode" NOT NULL,
	"exam_id" uuid NOT NULL,
	"subject_id" uuid,
	"topic_id" uuid,
	"total_questions" smallint NOT NULL,
	"time_limit_seconds" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"correct_count" smallint,
	"accuracy_percent" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookmarks" (
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"paystack_reference" varchar(100) NOT NULL,
	"amount_kobo" integer NOT NULL,
	"status" "payment_status" NOT NULL,
	"paid_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"paystack_subscription_code" varchar(100),
	"paystack_customer_code" varchar(100),
	"plan" "subscription_plan" NOT NULL,
	"amount_kobo" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"current_period_ends_at" timestamp with time zone NOT NULL,
	"status" "subscription_status" NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"template_key" varchar(50) NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" varchar(200),
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"error_message" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_impressions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"placement" varchar(50) NOT NULL,
	"session_id" varchar(100),
	"impression_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ready_points_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"reason" varchar(50) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"reward_days" smallint DEFAULT 0 NOT NULL,
	"qualified_at" timestamp with time zone,
	"rewarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"is_private" boolean DEFAULT true NOT NULL,
	"invite_code" varchar(20) NOT NULL,
	"member_limit" smallint DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "target_exams_user_exam_unique" ON "target_exams" USING btree ("user_id","exam_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "target_exams_user_idx" ON "target_exams" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "target_exams_date_idx" ON "target_exams" USING btree ("exam_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_unique" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_unique" ON "users" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_parent_idx" ON "users" USING btree ("parent_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_expiring_idx" ON "users" USING btree ("subscription_expires_at") WHERE "users"."subscription_tier" <> 'free';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exams_slug_unique" ON "exams" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exams_active_sort_idx" ON "exams" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subjects_exam_slug_unique" ON "subjects" USING btree ("exam_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subjects_exam_sort_idx" ON "subjects" USING btree ("exam_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "topics_subject_slug_unique" ON "topics" USING btree ("subject_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_subject_sort_idx" ON "topics" USING btree ("subject_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_parent_idx" ON "topics" USING btree ("parent_topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "options_question_label_unique" ON "options" USING btree ("question_id","label");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "options_question_sort_idx" ON "options" USING btree ("question_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_topic_idx" ON "questions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_subject_idx" ON "questions" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_active_practice_idx" ON "questions" USING btree ("is_active","exam_id","subject_id") WHERE "questions"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_past_year_idx" ON "questions" USING btree ("year","exam_id") WHERE "questions"."year" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_frequency_idx" ON "questions" USING btree ("frequency_score");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attempt_answers_attempt_question_unique" ON "attempt_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_answers_attempt_idx" ON "attempt_answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_answers_question_correct_idx" ON "attempt_answers" USING btree ("question_id","is_correct");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_answers_flagged_idx" ON "attempt_answers" USING btree ("attempt_id") WHERE "attempt_answers"."flagged" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempts_user_submitted_idx" ON "attempts" USING btree ("user_id","submitted_at" DESC NULLS LAST) WHERE "attempts"."submitted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempts_user_in_progress_idx" ON "attempts" USING btree ("user_id","started_at" DESC NULLS LAST) WHERE "attempts"."submitted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempts_user_mode_idx" ON "attempts" USING btree ("user_id","mode","submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempts_user_subject_idx" ON "attempts" USING btree ("user_id","subject_id","submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmarks_user_created_idx" ON "bookmarks" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_reference_unique" ON "payments" USING btree ("paystack_reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_user_paid_idx" ON "payments" USING btree ("user_id","paid_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_paystack_code_unique" ON "subscriptions" USING btree ("paystack_subscription_code") WHERE "subscriptions"."paystack_subscription_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_customer_code_idx" ON "subscriptions" USING btree ("paystack_customer_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_expiring_idx" ON "subscriptions" USING btree ("current_period_ends_at") WHERE "subscriptions"."status" IN ('active', 'trial', 'grace');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_log_user_sent_idx" ON "notification_log" USING btree ("user_id","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_log_provider_msg_idx" ON "notification_log" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_log_rate_limit_idx" ON "notification_log" USING btree ("user_id","channel","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_log_status_idx" ON "notification_log" USING btree ("status","sent_at") WHERE "notification_log"."status" IN ('queued', 'sent');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_impressions_at_idx" ON "ad_impressions" USING btree ("impression_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_impressions_user_idx" ON "ad_impressions" USING btree ("user_id","impression_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_impressions_placement_idx" ON "ad_impressions" USING btree ("placement","impression_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ready_points_user_created_idx" ON "ready_points_log" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ready_points_reason_idx" ON "ready_points_log" USING btree ("reason","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_pair_unique" ON "referrals" USING btree ("referrer_user_id","referred_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_referred_idx" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referrals_referrer_status_idx" ON "referrals" USING btree ("referrer_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_group_members_user_idx" ON "study_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "study_groups_invite_code_unique" ON "study_groups" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_groups_owner_idx" ON "study_groups" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_groups_exam_private_idx" ON "study_groups" USING btree ("exam_id","is_private");