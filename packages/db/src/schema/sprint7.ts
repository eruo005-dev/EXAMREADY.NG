/**
 * Sprint 7 schema additions — editorial factory tables.
 *
 * Five domain tables (universities, courses, university_courses,
 * cutoff_marks) and three operational tables (extraction_jobs,
 * ingestion_jobs, editorial_audit_log) plus a small scraping_cache
 * table for the web scraper.
 *
 * Each domain table carries a `source_path` or `source_url` field so
 * every row in the database can answer "where did this come from?".
 * The audit log table is the canonical reviewer trail.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ============================================================================
// universities — domain table for Nigerian institutions.
// ============================================================================

/**
 * Federal / state / private classification used by JAMB and NUC. We
 * model it as an enum so the admin UI's filter pills are stable.
 */
export const universityTypeEnum = pgEnum('university_type', [
  'federal',
  'state',
  'private',
  'polytechnic-federal',
  'polytechnic-state',
  'polytechnic-private',
  'monotechnic',
  'college-of-education',
  'innovation-enterprise-institution',
  'specialised',
  'other',
]);

export const universities = pgTable(
  'universities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Canonical full name as it appears on official documents. */
    name: text('name').notNull(),
    /** Slug for URLs — lowercase-kebab. */
    slug: varchar('slug', { length: 120 }).notNull(),
    /** Long-form name including campus / city if needed. */
    fullName: text('full_name'),
    type: universityTypeEnum('type').notNull(),
    /** Nigerian state where the main campus is located. */
    state: varchar('state', { length: 50 }).notNull(),
    /** Public website (HTTP[S] URL). */
    website: text('website'),
    /** JAMB short code used in the brochure (e.g. 'UI' for Ibadan). */
    jambCode: varchar('jamb_code', { length: 12 }),
    /** Year the institution was established. */
    establishedYear: smallint('established_year'),
    /** NUC accreditation status: 'full', 'interim', 'denied', null = unknown. */
    accreditationStatus: varchar('accreditation_status', { length: 20 }),
    /** URL of the institution's logo (CDN-hosted). */
    logoUrl: text('logo_url'),
    /** One-paragraph DeepSeek-generated description. PII-free. */
    description: text('description'),
    /** Admin can hide an entry without deleting it. */
    isActive: boolean('is_active').notNull().default(true),
    /** Provenance — source URL or materials/ relative path. */
    sourcePath: text('source_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex('universities_slug_idx').on(t.slug),
    stateIdx: index('universities_state_idx').on(t.state),
    typeIdx: index('universities_type_idx').on(t.type),
  }),
);

export type University = typeof universities.$inferSelect;
export type NewUniversity = typeof universities.$inferInsert;

// ============================================================================
// courses — academic programmes (degrees + diplomas).
// ============================================================================

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** e.g. 'Medicine and Surgery'. */
    name: text('name').notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    /** 1-2 sentence description (DeepSeek enrichment). */
    description: text('description'),
    /** Standard duration in years; null when variable across institutions. */
    durationYears: smallint('duration_years'),
    /**
     * JAMB subject combination for UTME applicants. Stored as an array of
     * subject slug arrays — most courses have ONE valid combination, but
     * some accept multiple (e.g. Pharmacy: [Phy, Chem, Bio] or [Phy, Chem, Maths]).
     * Example: [["english-language","mathematics","physics","chemistry"]]
     */
    jambSubjectCombination: jsonb('jamb_subject_combination').$type<string[][]>(),
    /**
     * SSCE (WAEC/NECO) O-level requirements.
     * Shape: { mandatory: string[], anyOf: string[][], minPasses: number }
     * Example: { mandatory: ["english","mathematics","biology","chemistry","physics"],
     *            anyOf: [], minPasses: 5 }
     */
    olevelRequirements: jsonb('olevel_requirements').$type<{
      mandatory: string[];
      anyOf?: string[][];
      minPasses: number;
    }>(),
    /** Career paths the course typically leads to (DeepSeek enrichment). */
    careerPaths: jsonb('career_paths').$type<string[]>(),
    /** Provenance. */
    sourcePath: text('source_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex('courses_slug_idx').on(t.slug),
    nameIdx: index('courses_name_idx').on(t.name),
  }),
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;

// ============================================================================
// university_courses — many-to-many: which courses each institution offers.
// ============================================================================

export const universityCourses = pgTable(
  'university_courses',
  {
    universityId: uuid('university_id')
      .notNull()
      .references(() => universities.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** Faculty / school within the university. */
    faculty: text('faculty'),
    /** Department name within the faculty. */
    department: text('department'),
    /**
     * Override of the default JAMB subject combination when this specific
     * institution requires a different combo for the same course.
     * NULL = use the default from `courses.jambSubjectCombination`.
     */
    jambSubjectCombinationOverride: jsonb('jamb_subject_combination_override').$type<string[][]>(),
    /** Override of the default O-level requirements (same shape as courses). */
    olevelRequirementsOverride: jsonb('olevel_requirements_override').$type<{
      mandatory: string[];
      anyOf?: string[][];
      minPasses: number;
    }>(),
    /** Provenance — usually the JAMB brochure file. */
    sourcePath: text('source_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.universityId, t.courseId] }),
    courseIdx: index('university_courses_course_idx').on(t.courseId),
  }),
);

export type UniversityCourse = typeof universityCourses.$inferSelect;
export type NewUniversityCourse = typeof universityCourses.$inferInsert;

// ============================================================================
// cutoff_marks — per (university, course, year) admission cutoffs.
// ============================================================================

export const cutoffMarks = pgTable(
  'cutoff_marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    universityId: uuid('university_id')
      .notNull()
      .references(() => universities.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    year: smallint('year').notNull(),
    /** UTME cutoff (0-400). NULL when only post-UTME cutoff applies. */
    cutoffScore: smallint('cutoff_score'),
    /** Aggregate UTME + post-UTME cutoff (0-100 scale). NULL when not aggregated. */
    aggregateCutoff: smallint('aggregate_cutoff'),
    /** Free-text notes — admission-channel specifics, exceptions, etc. */
    notes: text('notes'),
    /** URL the value was scraped from (or 'manual' for admin entry). */
    sourceUrl: text('source_url'),
    /** Last time the cutoff was verified against the source. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqIdx: uniqueIndex('cutoff_marks_uniq_idx').on(t.universityId, t.courseId, t.year),
    yearIdx: index('cutoff_marks_year_idx').on(t.year),
  }),
);

export type CutoffMark = typeof cutoffMarks.$inferSelect;
export type NewCutoffMark = typeof cutoffMarks.$inferInsert;

// ============================================================================
// extraction_jobs — per-file extractor state (resumability).
// ============================================================================

export const extractionStatusEnum = pgEnum('extraction_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'skipped',
]);

export const extractionJobs = pgTable(
  'extraction_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable key — relative path under materials/, or scrape URL. */
    sourceKey: text('source_key').notNull(),
    /** What kind of file we extracted (pdf, docx, html, ...). */
    sourceKind: varchar('source_kind', { length: 16 }).notNull(),
    status: extractionStatusEnum('status').notNull().default('queued'),
    /** Page count for paginated formats; 0 otherwise. */
    pageCount: integer('page_count').notNull().default(0),
    /** Bytes of normalised text emitted. */
    textBytes: integer('text_bytes').notNull().default(0),
    /** True if this file routed to vision (scanned PDF). */
    usedVision: boolean('used_vision').notNull().default(false),
    /** Last error message when status='failed'. */
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceKeyIdx: uniqueIndex('extraction_jobs_source_key_idx').on(t.sourceKey),
    statusIdx: index('extraction_jobs_status_idx').on(t.status, t.createdAt.desc()),
  }),
);

export type ExtractionJob = typeof extractionJobs.$inferSelect;
export type NewExtractionJob = typeof extractionJobs.$inferInsert;

// ============================================================================
// ingestion_jobs — per-file pipeline state (parse → enrich → audit).
// ============================================================================

export const ingestionPipelineEnum = pgEnum('ingestion_pipeline', [
  'questions',
  'syllabus',
  'university',
  'cutoff',
  'course-combinations',
  'reference',
]);

export const ingestionStatusEnum = pgEnum('ingestion_status', [
  'queued',
  'parsing',
  'enriching',
  'auditing',
  'completed',
  'failed',
  'skipped',
]);

export const ingestionJobs = pgTable(
  'ingestion_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** FK to the extraction job that produced the input. */
    extractionJobId: uuid('extraction_job_id')
      .notNull()
      .references(() => extractionJobs.id, { onDelete: 'cascade' }),
    pipeline: ingestionPipelineEnum('pipeline').notNull(),
    status: ingestionStatusEnum('status').notNull().default('queued'),
    /** Number of rows produced by this job (questions, topics, ...). */
    rowsProduced: integer('rows_produced').notNull().default(0),
    /** Estimated DeepSeek cost in USD (sum of enrich + audit). */
    costUsd: text('cost_usd'), // TEXT to avoid float precision drift; admin formats.
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    extractionIdx: index('ingestion_jobs_extraction_idx').on(t.extractionJobId),
    statusIdx: index('ingestion_jobs_status_idx').on(t.status, t.createdAt.desc()),
    pipelineIdx: index('ingestion_jobs_pipeline_idx').on(t.pipeline, t.status),
  }),
);

export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;

// ============================================================================
// editorial_audit_log — DeepSeek self-audit verdict per produced row.
// ============================================================================

export const auditVerdictEnum = pgEnum('audit_verdict', [
  'auto_approved',
  'needs_review',
  'rejected_by_audit',
  'human_approved',
  'human_rejected',
]);

export const editorialAuditLog = pgTable(
  'editorial_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Which pipeline produced the row. */
    sourcePipeline: ingestionPipelineEnum('source_pipeline').notNull(),
    /** Target table the row was written to (e.g. 'questions', 'universities'). */
    targetTable: varchar('target_table', { length: 64 }).notNull(),
    /** UUID of the row in the target table. */
    targetId: uuid('target_id').notNull(),
    /** 0-100. ≥85 → auto_approved (no critical flag). */
    confidenceOverall: smallint('confidence_overall').notNull(),
    /**
     * Per-dimension scores (e.g. for questions: { stem_clarity: 90,
     * options_balanced: 85, answer_correct: 95, explanation_quality: 80 }).
     * Shape varies by pipeline; consumers must validate against the
     * pipeline-specific Zod schema.
     */
    dimensions: jsonb('dimensions').$type<Record<string, number>>(),
    /** Hard flags that disqualify auto-approval ('answer_mismatch', 'missing_explanation'). */
    flags: jsonb('flags').$type<string[]>().notNull().default([]),
    /** Human-readable reasoning from the audit model. */
    reasoning: text('reasoning'),
    /** Audit verdict — derived from confidence + flags but stored explicitly. */
    verdict: auditVerdictEnum('verdict').notNull(),
    /** Model used for the audit pass (e.g. 'deepseek-chat'). */
    auditModel: varchar('audit_model', { length: 64 }).notNull(),
    /** Cost of the audit call in USD (4 decimals). */
    auditCostUsd: text('audit_cost_usd'),
    /** Reviewer who overrode the verdict, if any. */
    reviewedByUserId: uuid('reviewed_by_user_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    auditAt: timestamp('audit_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    targetIdx: index('editorial_audit_target_idx').on(t.targetTable, t.targetId),
    verdictIdx: index('editorial_audit_verdict_idx').on(t.verdict, t.auditAt.desc()),
    pipelineIdx: index('editorial_audit_pipeline_idx').on(t.sourcePipeline, t.auditAt.desc()),
  }),
);

export type EditorialAuditLogRow = typeof editorialAuditLog.$inferSelect;
export type NewEditorialAuditLogRow = typeof editorialAuditLog.$inferInsert;

// ============================================================================
// scraping_cache — HTTP response cache for web scrapers.
// ============================================================================

export const scrapingCache = pgTable(
  'scraping_cache',
  {
    /** Canonical URL (after redirects, lowercased host). */
    url: text('url').primaryKey(),
    /** HTTP status code. */
    statusCode: smallint('status_code').notNull(),
    /** Raw response body (HTML or PDF base64 — small files only). */
    body: text('body').notNull(),
    /** Content-Type header. */
    contentType: varchar('content_type', { length: 200 }),
    /** When the cache was last refreshed. */
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    /** TTL hint — caller may request a fresh fetch if older. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => ({
    fetchedAtIdx: index('scraping_cache_fetched_at_idx').on(t.fetchedAt.desc()),
  }),
);

export type ScrapingCacheRow = typeof scrapingCache.$inferSelect;
export type NewScrapingCacheRow = typeof scrapingCache.$inferInsert;

// ============================================================================
// reference_content — long-form text passages stored for later use
// (Phase 6 lessons, blog enrichment, AI tutor RAG context).
// ============================================================================

export const referenceContentKindEnum = pgEnum('reference_content_kind', [
  'study-notes',
  'exam-information',
  'syllabus-text',
  'reference-article',
]);

export const referenceContent = pgTable(
  'reference_content',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: referenceContentKindEnum('kind').notNull(),
    /** Short title for admin UI. */
    title: text('title').notNull(),
    /** Optional slug for permanent URL. */
    slug: varchar('slug', { length: 200 }),
    /** Optional FK to topic if the content maps to one. */
    topicId: uuid('topic_id'),
    /** Optional FK to exam if the content is exam-specific. */
    examId: uuid('exam_id'),
    /** Body markdown — sanitised before render. */
    content: text('content').notNull(),
    /** Word count cache for sort/filter. */
    wordCount: integer('word_count').notNull().default(0),
    sourcePath: text('source_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index('reference_content_kind_idx').on(t.kind),
    topicIdx: index('reference_content_topic_idx').on(t.topicId),
    slugIdx: index('reference_content_slug_idx').on(t.slug),
  }),
);

export type ReferenceContent = typeof referenceContent.$inferSelect;
export type NewReferenceContent = typeof referenceContent.$inferInsert;

// ============================================================================
// exam_paper_specs — per (exam × subject) CBT paper structure.
// ============================================================================
//
// One row defines the JAMB-style mock for a (exam, subject) pair: how
// many questions, how many minutes, what kind of questions, whether
// passages are allowed, etc.
//
// JAMB UTME's defaults:
//   - English: 60 questions, 30 min, mcq_single + comprehension
//   - Other subjects (Math/Phys/Chem/Bio/etc.): 40 questions, 30 min each
//   - Full mock: 4 subjects × the above = 180 questions, 120 min total
//
// WAEC/NECO use this same table with their own per-paper config.
//
// The full-mock composition (which subjects → which spec) is stored in
// the user's attempt config, not here, because it varies per student
// (English is mandatory, the other 3 are chosen).

export const examPaperSpecs = pgTable(
  'exam_paper_specs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    examId: uuid('exam_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    /** How many questions in the paper for this subject. */
    questionCount: smallint('question_count').notNull(),
    /** Time allowed in minutes. */
    durationMinutes: smallint('duration_minutes').notNull(),
    /** Total marks (e.g. 100 for JAMB). */
    totalMarks: smallint('total_marks').notNull(),
    /** Allowed question types as a string array (jsonb for forward-compat). */
    allowedQuestionTypes: jsonb('allowed_question_types')
      .$type<string[]>()
      .notNull()
      .default(['mcq_single']),
    /** True = allow comprehension passages (English typically). */
    allowsComprehension: boolean('allows_comprehension').notNull().default(false),
    /** True = allow theory questions (WAEC/NECO essay subjects). */
    allowsTheory: boolean('allows_theory').notNull().default(false),
    /** True = paper supports the JAMB calculator widget. */
    calculatorAllowed: boolean('calculator_allowed').notNull().default(true),
    /** Optional human-readable note (e.g. "Paper 1 — objective only"). */
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex('exam_paper_specs_exam_subject_idx').on(t.examId, t.subjectId),
  }),
);

export type ExamPaperSpec = typeof examPaperSpecs.$inferSelect;
export type NewExamPaperSpec = typeof examPaperSpecs.$inferInsert;

// ============================================================================
// topic_lessons — Phase 6 lessons per topic.
// ============================================================================
//
// One row per topic with a long-form lesson body (markdown). Generated
// per topic by DeepSeek using the topic name + description (Phase 3
// syllabus pipeline output) as anchor. Reviewed via the existing
// J/K/A/R/E shortcuts in /admin/lessons/queue (consistent with the
// question moderation queue).
//
// Public route: /lessons/[examSlug]/[subjectSlug]/[topicSlug]
// SEO-indexable; reuses the Sprint 6 MDX renderer.

export const lessonStatusEnum = pgEnum('lesson_status', [
  'draft',
  'review',
  'published',
  'archived',
]);

export const topicLessons = pgTable(
  'topic_lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id').notNull(),
    title: text('title').notNull(),
    slug: varchar('slug', { length: 200 }).notNull(),
    /** Markdown body — sanitised on render. */
    contentMarkdown: text('content_markdown').notNull(),
    /** HTML cache from the markdown renderer. Refreshed on update. */
    contentHtml: text('content_html'),
    /** Estimated reading time in minutes. */
    readingTimeMinutes: smallint('reading_time_minutes').notNull().default(5),
    /** Dependency topics — frontend renders prerequisites callouts. */
    prerequisiteTopicIds: jsonb('prerequisite_topic_ids').$type<string[]>(),
    /** Worked examples count parsed from the body. */
    workedExamplesCount: smallint('worked_examples_count').notNull().default(0),
    status: lessonStatusEnum('status').notNull().default('draft'),
    /** AI provenance — model that generated this lesson. */
    generatedByModel: varchar('generated_by_model', { length: 64 }),
    /** Reviewer who approved this lesson. */
    approvedByUserId: uuid('approved_by_user_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    topicIdx: uniqueIndex('topic_lessons_topic_idx').on(t.topicId),
    slugIdx: uniqueIndex('topic_lessons_slug_idx').on(t.slug),
    statusIdx: index('topic_lessons_status_idx').on(t.status, t.updatedAt.desc()),
  }),
);

export type TopicLesson = typeof topicLessons.$inferSelect;
export type NewTopicLesson = typeof topicLessons.$inferInsert;

// user_lesson_progress — tracks bookmark + mark-as-read state per user.
export const userLessonProgress = pgTable(
  'user_lesson_progress',
  {
    userId: uuid('user_id').notNull(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => topicLessons.id, { onDelete: 'cascade' }),
    bookmarked: boolean('bookmarked').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Reading-progress percentage (0-100). Updated by client scroll listener. */
    progressPercent: smallint('progress_percent').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.lessonId] }),
    bookmarkIdx: index('user_lesson_progress_bookmark_idx').on(t.userId, t.bookmarked),
  }),
);

export type UserLessonProgress = typeof userLessonProgress.$inferSelect;
export type NewUserLessonProgress = typeof userLessonProgress.$inferInsert;
