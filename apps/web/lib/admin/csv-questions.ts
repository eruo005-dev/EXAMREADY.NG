/**
 * CSV question import — pure parser, no DB calls.
 *
 * Validates each row against questionCreateInputSchema (after lookups for
 * exam/subject/topic slugs → UUIDs). Returns { rows, errors } where rows
 * are ready to insert.
 *
 * The CSV format is documented in
 * apps/web/app/api/admin/questions/import/CSV_FORMAT.md.
 */
import {
  questionCreateInputSchema,
  type CsvImportError,
  type QuestionCreateInput,
} from '@examready/shared';
import Papa from 'papaparse';


export type CsvParseResult = {
  rows: QuestionCreateInput[];
  errors: CsvImportError[];
};

export type SlugLookups = {
  examSlugToId: Map<string, string>;
  subjectSlugToId: Map<string, string>; // key: "examSlug/subjectSlug"
  topicSlugToId: Map<string, string>; // key: "examSlug/subjectSlug/topicSlug"
};

const REQUIRED_COLUMNS = [
  'exam_slug',
  'subject_slug',
  'topic_slug',
  'difficulty',
  'stem',
  'explanation',
  'option_a',
  'option_b',
  'correct_option',
] as const;

type CsvRow = Record<string, string | undefined>;

export function parseCsvQuestions(
  csv: string,
  lookups: SlugLookups,
  options: { maxRows?: number } = {},
): CsvParseResult {
  const maxRows = options.maxRows ?? 1000;
  const result: CsvParseResult = { rows: [], errors: [] };

  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });

  if (parsed.errors.length > 0) {
    parsed.errors.forEach((e) => {
      result.errors.push({
        row: (e.row ?? 0) + 1,
        message: `CSV parse: ${e.message}`,
      });
    });
  }

  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    result.errors.push({
      row: 0,
      message: `Missing required columns: ${missing.join(', ')}`,
    });
    return result;
  }

  if (parsed.data.length > maxRows) {
    result.errors.push({
      row: 0,
      message: `Too many rows: ${parsed.data.length}. Max ${maxRows} per upload.`,
    });
    return result;
  }

  parsed.data.forEach((row, idx) => {
    const rowNum = idx + 2; // +1 for 1-based, +1 for header row
    const validated = validateRow(row, lookups, rowNum);
    if ('error' in validated) {
      result.errors.push({ row: rowNum, message: validated.error });
    } else {
      result.rows.push(validated.row);
    }
  });

  return result;
}

function validateRow(
  row: CsvRow,
  lookups: SlugLookups,
  _rowNum: number,
): { row: QuestionCreateInput } | { error: string } {
  const examSlug = (row.exam_slug ?? '').trim();
  const subjectSlug = (row.subject_slug ?? '').trim();
  const topicSlug = (row.topic_slug ?? '').trim();

  const examId = lookups.examSlugToId.get(examSlug);
  if (!examId) return { error: `Unknown exam_slug: ${examSlug}` };

  const subjectId = lookups.subjectSlugToId.get(`${examSlug}/${subjectSlug}`);
  if (!subjectId) return { error: `Unknown subject_slug for exam: ${examSlug}/${subjectSlug}` };

  const topicId = lookups.topicSlugToId.get(`${examSlug}/${subjectSlug}/${topicSlug}`);
  if (!topicId) return { error: `Unknown topic_slug: ${topicSlug}` };

  const difficulty = parseInt((row.difficulty ?? '').trim(), 10);
  if (Number.isNaN(difficulty)) return { error: 'difficulty must be an integer 1-5' };

  const yearStr = (row.year ?? '').trim();
  const year = yearStr === '' ? undefined : parseInt(yearStr, 10);
  if (year !== undefined && Number.isNaN(year)) return { error: 'year must be an integer' };

  const stem = (row.stem ?? '').trim();
  const explanation = (row.explanation ?? '').trim();
  const passage = (row.passage ?? '').trim() || undefined;
  const source = (row.source ?? '').trim() || undefined;

  // Options: option_a, option_b, option_c, option_d (a/b are required;
  // c/d optional). correct_option is a comma-separated list of labels.
  const options: Array<{ label: string; content: string; isCorrect: boolean; sortOrder: number }> = [];
  const labels = ['A', 'B', 'C', 'D', 'E'];
  for (const label of labels) {
    const content = (row[`option_${label.toLowerCase()}`] ?? '').trim();
    if (!content) continue;
    options.push({ label, content, isCorrect: false, sortOrder: options.length });
  }

  if (options.length < 2) return { error: 'At least 2 options required (option_a + option_b)' };

  const correctLabels = (row.correct_option ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  if (correctLabels.length === 0) return { error: 'correct_option is required' };

  for (const correctLabel of correctLabels) {
    const opt = options.find((o) => o.label === correctLabel);
    if (!opt) return { error: `correct_option references missing option: ${correctLabel}` };
    opt.isCorrect = true;
  }

  // Detect single-vs-multi correct.
  const questionType: QuestionCreateInput['questionType'] =
    correctLabels.length > 1 ? 'mcq_multi' : passage ? 'comprehension' : 'mcq_single';

  const candidate = {
    examId,
    subjectId,
    topicId,
    questionType,
    stem,
    passage,
    media: [],
    difficulty,
    year,
    source,
    explanation,
    frequencyScore: 50,
    isActive: true,
    options,
  };

  const validated = questionCreateInputSchema.safeParse(candidate);
  if (!validated.success) {
    const firstIssue = validated.error.issues[0];
    return {
      error: firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'validation failed',
    };
  }

  return { row: validated.data };
}
