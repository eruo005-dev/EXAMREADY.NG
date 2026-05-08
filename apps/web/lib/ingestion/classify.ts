/**
 * File classifier — decides which pipeline gets a given material.
 *
 * Two layers:
 *
 *   1. HEURISTIC pass (always runs, free):
 *      - Filename pattern matching (jamb-brochure, past-questions, syllabus, etc.)
 *      - Content pattern matching when extracted preview is available
 *        (e.g. presence of "Cut-off Mark", "Subject Combination", "Topic 1.")
 *      - Returns confidence 60-95 depending on signal strength
 *
 *   2. DEEPSEEK pass (only when heuristic is < 70 OR content shows mixed
 *      signals OR the operator passes --force-ai):
 *      - Sends filename + preview + first-page content
 *      - DeepSeek-chat returns category + confidence + reasoning
 *      - We trust DeepSeek up to 95; never auto-set 100 — the audit log
 *        always implies a human can override.
 *
 * The 70 threshold is the same band the audit pipeline (Phase 2.5) uses
 * for auto-approval. Keeping the numbers aligned makes it easy for the
 * admin UI to apply consistent UX cues across stages.
 */
import { basename } from 'node:path';

import type { ClassificationResult, ExtractedFile, MaterialCategory } from './types';

interface HeuristicRule {
  /** Higher score wins ties. Stronger filename signals score higher. */
  weight: number;
  /** RegExp run against the filename (lowercased). */
  filename?: RegExp;
  /** RegExp run against the preview text (lowercased). */
  content?: RegExp;
  category: MaterialCategory;
  reason: string;
}

const RULES: HeuristicRule[] = [
  // --- past questions ---
  {
    weight: 90,
    filename: /past[\s_-]?questions?|past[\s_-]?papers?/,
    category: 'past-questions',
    reason: 'filename contains "past questions" / "past papers"',
  },
  {
    weight: 85,
    filename: /(jamb|waec|neco|nabteb|gce|post-utme).*?(\d{4})?.*?(question|paper)/,
    category: 'past-questions',
    reason: 'filename matches exam-name + question/paper pattern',
  },
  // --- syllabus ---
  {
    weight: 95,
    filename: /syllabus|curriculum|scheme[\s_-]?of[\s_-]?work/,
    category: 'syllabus',
    reason: 'filename indicates syllabus/curriculum',
  },
  // --- university / school list ---
  {
    weight: 80,
    filename: /universit(y|ies)|institutions?|schools?|polytechnics?|monotechnics?|colleges?/,
    category: 'university-list',
    reason: 'filename indicates institution list',
  },
  // --- JAMB brochure → course-requirements ---
  {
    weight: 90,
    filename: /brochure|entry[\s_-]?requirements?|admission[\s_-]?requirements?/,
    category: 'course-requirements',
    reason: 'filename indicates brochure / entry requirements',
  },
  // --- subject combinations ---
  {
    weight: 85,
    filename: /subject[\s_-]?combinations?|jamb[\s_-]?combinations?/,
    category: 'course-combinations',
    reason: 'filename indicates subject combinations',
  },
  // --- cutoff marks ---
  {
    weight: 95,
    filename: /cut[\s_-]?off[\s_-]?marks?|cutoffs?/,
    category: 'cutoff-marks',
    reason: 'filename indicates cutoff marks',
  },
  // --- exam information ---
  {
    weight: 75,
    filename: /timetable|registration|requirements|guidelines?|brochure[\s_-]?guide/,
    category: 'exam-information',
    reason: 'filename indicates exam information',
  },
  // --- study notes / reference ---
  {
    weight: 70,
    filename: /notes?|tutorials?|lessons?|topics?|guide/,
    category: 'study-notes',
    reason: 'filename indicates study notes / lessons',
  },

  // ---------- content-based rules (run when preview exists) ----------
  {
    weight: 90,
    content: /question\s*\d+\.|q\.?\s*\d+\.|\(a\)\s+.+?\(b\)\s+.+?\(c\)\s+.+?\(d\)/i,
    category: 'past-questions',
    reason: 'content has multiple-choice question patterns',
  },
  {
    weight: 88,
    content: /cut[\s-]?off\s+mark/i,
    category: 'cutoff-marks',
    reason: 'content mentions "cut-off mark"',
  },
  {
    weight: 85,
    content: /jamb\s+subject\s+combination|subject\s+combination\s+for/i,
    category: 'course-combinations',
    reason: 'content describes subject combinations',
  },
  {
    weight: 82,
    content: /faculty\s+of|department\s+of.+university/i,
    category: 'course-requirements',
    reason: 'content describes faculty / departmental requirements',
  },
  {
    weight: 75,
    content: /topic\s*\d+\.\s|sub[\s-]?topic|behavioural\s+objective|performance\s+objective/i,
    category: 'syllabus',
    reason: 'content matches syllabus structure (topics + objectives)',
  },
  {
    weight: 70,
    content: /federal\s+university|state\s+university|private\s+university/i,
    category: 'university-list',
    reason: 'content lists universities',
  },
];

/** Try to pull an exam slug + year + subject hint out of the filename. */
function extractFilenameHints(filename: string): ClassificationResult['hints'] {
  const lower = filename.toLowerCase();
  const hints: NonNullable<ClassificationResult['hints']> = {};

  if (/jamb[\s_-]?utme|jamb-utme|^jamb/.test(lower)) hints.examSlug = 'jamb-utme';
  else if (/waec/.test(lower)) hints.examSlug = 'waec-ssce';
  else if (/neco/.test(lower)) hints.examSlug = 'neco-ssce';
  else if (/post[\s_-]?utme/.test(lower)) hints.examSlug = 'post-utme';
  else if (/nabteb/.test(lower)) hints.examSlug = 'nabteb';
  else if (/gce/.test(lower)) hints.examSlug = 'gce';

  const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) hints.year = Number(yearMatch[1]);

  // Subject hints — a reasonably exhaustive set for common JAMB/WAEC subjects.
  const subjectMap: Record<string, string> = {
    mathematics: 'mathematics',
    maths: 'mathematics',
    english: 'english-language',
    biology: 'biology',
    chemistry: 'chemistry',
    physics: 'physics',
    economics: 'economics',
    government: 'government',
    geography: 'geography',
    literature: 'literature-in-english',
    crk: 'christian-religious-knowledge',
    irs: 'islamic-religious-studies',
    irk: 'islamic-religious-knowledge',
    history: 'history',
    accounting: 'accounting',
    commerce: 'commerce',
    'agric science': 'agricultural-science',
    agricultural: 'agricultural-science',
  };
  for (const [needle, slug] of Object.entries(subjectMap)) {
    if (lower.includes(needle)) {
      hints.subjectSlug = slug;
      break;
    }
  }

  return Object.keys(hints).length ? hints : undefined;
}

/**
 * Run the heuristic classifier. Always returns a result — falls back to
 * 'unknown' with confidence 50 when nothing matches.
 */
export function classifyHeuristic(file: ExtractedFile): ClassificationResult {
  const filename = basename(file.relativePath).toLowerCase();
  const preview = file.preview.toLowerCase();
  const hints = extractFilenameHints(filename);

  let best: { rule: HeuristicRule; score: number } | null = null;

  for (const rule of RULES) {
    let matched = false;
    if (rule.filename && rule.filename.test(filename)) matched = true;
    if (!matched && rule.content && preview && rule.content.test(preview)) matched = true;
    if (!matched) continue;
    if (!best || rule.weight > best.score) {
      best = { rule, score: rule.weight };
    }
  }

  if (!best) {
    return {
      category: 'unknown',
      confidence: 50,
      source: 'heuristic',
      reasoning: 'no filename or content pattern matched; routed to manual review',
      hints,
    };
  }

  return {
    category: best.rule.category,
    confidence: Math.min(95, best.score),
    source: 'heuristic',
    reasoning: best.rule.reason,
    hints,
  };
}

/**
 * Optional DeepSeek classifier. Returns null if the AI client is not
 * configured — the caller falls back to the heuristic result. The
 * inventory CLI reports which path was used in the materials-inventory.md
 * `Source` column so reviewers know what to trust.
 *
 * NOT exported as the default path because:
 *  - Phase 1 must run without a live API key
 *  - Heuristic catches ~80% of files cleanly
 *  - DeepSeek call is ~$0.0001 per file but adds latency
 *
 * Phase 2 wires this into the full pipeline runner with caching.
 */
export async function classifyWithDeepSeek(
  file: ExtractedFile,
  heuristic: ClassificationResult,
): Promise<ClassificationResult | null> {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  if (!file.preview) return null;
  if (heuristic.confidence >= 85) return null; // heuristic is confident, don't burn tokens

  // Lazy-import the AI provider so the inventory CLI doesn't pay the
  // import cost when the user runs it without a key.
  let getProvider: typeof import('../ai/providers').getProvider;
  try {
    const providers = await import('../ai/providers');
    getProvider = providers.getProvider;
  } catch {
    return null;
  }

  const ds = getProvider('deepseek');
  if (!ds.isConfigured()) return null;

  const systemPrompt = [
    'You classify exam-related source documents into one of these categories:',
    '- past-questions: actual exam questions with answers',
    '- syllabus: official curriculum/topic listings',
    '- study-notes: lesson content, tutorials, study material',
    '- university-list: list of universities/institutions',
    '- school-list: list of schools (polytechnics, monotechnics, colleges)',
    '- course-requirements: faculty/departmental admission requirements',
    '- course-combinations: JAMB subject combinations per course',
    '- cutoff-marks: per-university per-course admission cutoff scores',
    '- exam-information: timetables, registration guides, brochures',
    '- reference-content: general reference material',
    '- unknown: cannot determine',
    '',
    'Respond ONLY with strict JSON: {"category": "<one>", "confidence": <0-100>, "reasoning": "<one sentence>"}',
    'Do not include any text outside the JSON object.',
  ].join('\n');

  const user = [
    `Filename: ${basename(file.relativePath)}`,
    `Detected kind: ${file.kind}`,
    `Page count: ${file.pageCount}`,
    `Heuristic guess: ${heuristic.category} (confidence ${heuristic.confidence})`,
    `Heuristic reasoning: ${heuristic.reasoning}`,
    '',
    'Preview (first 2000 chars):',
    file.preview.slice(0, 2000),
  ].join('\n');

  try {
    // 'deepseek-chat' is DeepSeek-V3, the volume worker model.
    const result = await ds.completion({
      model: 'deepseek-chat',
      systemPrompt,
      messages: [{ role: 'user', content: user }],
      temperature: 0.1,
      maxTokens: 200,
    });
    const text = result.text.trim();
    const json = JSON.parse(text.startsWith('```') ? text.replace(/```(?:json)?|```/g, '') : text);
    if (typeof json.category !== 'string' || typeof json.confidence !== 'number') return null;
    return {
      category: json.category as ClassificationResult['category'],
      confidence: Math.max(0, Math.min(95, Math.round(json.confidence))),
      source: 'deepseek',
      reasoning: String(json.reasoning ?? '(no reasoning)'),
      hints: heuristic.hints,
    };
  } catch {
    return null;
  }
}
