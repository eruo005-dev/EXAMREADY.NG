/**
 * Editorial factory shared types.
 *
 * The factory has a strict pipeline shape:
 *
 *   raw file (materials/) → extractor → normalized text
 *                                          ↓
 *                                       classifier → category + confidence
 *                                          ↓
 *                                       pipeline router → structured rows
 *                                          ↓
 *                                       enricher (DeepSeek)
 *                                          ↓
 *                                       self-audit (DeepSeek)
 *                                          ↓
 *                                       database tables + editorial_audit_log
 *
 * Every stage emits typed artefacts so the next stage can pick up where
 * the previous one stopped. All artefacts include a `source_path` field
 * threading provenance through the entire pipeline — no row in the
 * database should ever be unable to answer "where did this come from?".
 */

/**
 * High-level categories the classifier picks. Each maps to one ingestion
 * pipeline (see `pipelineForCategory`). The list is fixed so the admin
 * UI's filter dropdowns don't drift.
 */
export const MATERIAL_CATEGORIES = [
  'past-questions',
  'syllabus',
  'study-notes',
  'university-list',
  'school-list',
  'course-requirements',
  'course-combinations',
  'cutoff-marks',
  'exam-information',
  'reference-content',
  'unknown',
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

/** What pipeline should consume a given category. */
export const INGESTION_PIPELINES = [
  'ingest-as-questions',
  'ingest-as-syllabus',
  'ingest-as-university-data',
  'ingest-as-cutoff-data',
  'ingest-as-course-combinations',
  'ingest-as-reference',
  'manual-review-needed',
] as const;
export type IngestionPipeline = (typeof INGESTION_PIPELINES)[number];

/**
 * Single mapping. Edit here if a new category is added. The unknown
 * category routes to manual review by design — the human picks.
 */
export function pipelineForCategory(c: MaterialCategory): IngestionPipeline {
  switch (c) {
    case 'past-questions':
      return 'ingest-as-questions';
    case 'syllabus':
      return 'ingest-as-syllabus';
    case 'university-list':
    case 'school-list':
      return 'ingest-as-university-data';
    case 'course-requirements':
    case 'course-combinations':
      return 'ingest-as-course-combinations';
    case 'cutoff-marks':
      return 'ingest-as-cutoff-data';
    case 'study-notes':
    case 'exam-information':
    case 'reference-content':
      return 'ingest-as-reference';
    case 'unknown':
      return 'manual-review-needed';
  }
}

export type FileKind = 'pdf' | 'docx' | 'image' | 'text' | 'csv' | 'json' | 'html' | 'unknown';

/** What the extractor returns regardless of file type. */
export interface ExtractedFile {
  /** Absolute path on disk. */
  sourcePath: string;
  /** Relative to materials/ root, used for display and as a stable key. */
  relativePath: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Detected file kind. */
  kind: FileKind;
  /** Best-effort extracted text (first N pages or whole file for short ones). */
  preview: string;
  /** True when the extractor produced enough text to classify. */
  hasUsableText: boolean;
  /** Page count for paginated formats (PDF, DOCX). 0 otherwise. */
  pageCount: number;
  /** Error message if extraction failed. preview will be empty/heuristic. */
  extractionError?: string;
}

/** Output of the classifier — heuristic OR DeepSeek-driven. */
export interface ClassificationResult {
  category: MaterialCategory;
  /** 0-100. Heuristic floor: 60. DeepSeek can return higher. */
  confidence: number;
  /** 'heuristic' | 'deepseek' | 'manual'. */
  source: 'heuristic' | 'deepseek' | 'manual';
  /** Free-text reason — handy for the inventory report. */
  reasoning: string;
  /** Hints picked up from filename or content (e.g. detected exam slug). */
  hints?: {
    examSlug?: string;
    subjectSlug?: string;
    year?: number;
  };
}

/** What the inventory CLI emits per file (one row in materials-inventory.md). */
export interface InventoryEntry {
  file: ExtractedFile;
  classification: ClassificationResult;
  pipeline: IngestionPipeline;
  /** One-line recommendation written to the report. */
  recommendation: string;
}
