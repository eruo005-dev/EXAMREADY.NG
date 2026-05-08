/**
 * DeepSeek self-audit pass — the editorial factory's cost-saving moat.
 *
 * After every pipeline produces a row (question, university, cutoff, ...),
 * we run a SECOND DeepSeek call with an adversarial system prompt that
 * scores the row across pipeline-specific dimensions, surfaces hard flags,
 * and emits an overall confidence number. The verdict drops into
 * `editorial_audit_log`.
 *
 *   confidence ≥ 85 ∧ no critical flag → `auto_approved`
 *   70 ≤ confidence < 85               → `needs_review`
 *   confidence < 70                    → `rejected_by_audit`
 *
 * Why a separate pass instead of asking the original model to audit
 * itself in the same call: one of DeepSeek's failure modes is over-
 * confidence — once it's committed to an answer in turn 1, turn 2 of
 * the same conversation tends to defend it. A FRESH call with a
 * different system prompt and lower temperature breaks that anchoring.
 *
 * Why DeepSeek-chat (V3) and not DeepSeek-reasoner (R1) for the audit:
 * audit at scale needs to be cheap. R1 would 4x the cost without
 * meaningfully better quality on this kind of structured scoring.
 */
import { getProvider } from '../ai/providers';

import { estimateCost } from './cost';
import type { PipelineName } from './types';

/**
 * Output of an audit pass — written verbatim to editorial_audit_log.
 *
 * Dimension keys vary per pipeline. The Zod validator in audit-prompts.ts
 * shapes each pipeline's dimensions but we keep the runtime type loose
 * (Record<string, number>) because we want to be able to ADD dimensions
 * to the audit prompt without bumping the audit_log schema.
 */
export interface AuditVerdict {
  confidenceOverall: number;
  dimensions: Record<string, number>;
  flags: string[];
  reasoning: string;
  /** Derived from confidence + flags. */
  verdict: 'auto_approved' | 'needs_review' | 'rejected_by_audit';
  /** Audit cost in USD (4-decimal precision). */
  costUsd: number;
  /** Audit model identifier — pinned in the row for prompt-version traceability. */
  model: string;
}

/** Dimensions we ask DeepSeek to score for each pipeline. */
const DIMENSIONS: Record<PipelineName, string[]> = {
  questions: [
    'stem_clarity',
    'options_balanced',
    'answer_correct',
    'distractors_plausible',
    'explanation_quality',
    'topic_match',
    'difficulty_appropriate',
  ],
  syllabus: ['topic_well_named', 'description_accurate', 'level_correct', 'duplicates_check'],
  university: [
    'name_correct',
    'state_correct',
    'type_correct',
    'website_valid',
    'description_factual',
  ],
  cutoff: ['institution_match', 'course_match', 'year_correct', 'value_plausible'],
  'course-combinations': [
    'subjects_complete',
    'subject_codes_valid',
    'olevel_requirements_complete',
    'duration_plausible',
  ],
  reference: [
    'content_factual',
    'no_copyright_issue',
    'topic_relevant',
    'no_pii',
    'language_quality',
  ],
};

/** Critical flags that block auto-approval regardless of overall confidence. */
const CRITICAL_FLAGS = new Set([
  'answer_mismatch', // questions: marked answer doesn't match explanation
  'fabricated_url',
  'fabricated_year',
  'fabricated_school',
  'pii_present',
  'copyright_violation_likely',
  'cross_field_contradiction',
]);

function deriveVerdict(
  confidence: number,
  flags: string[],
): 'auto_approved' | 'needs_review' | 'rejected_by_audit' {
  const hasCritical = flags.some((f) => CRITICAL_FLAGS.has(f));
  if (hasCritical) return 'rejected_by_audit';
  if (confidence >= 85) return 'auto_approved';
  if (confidence >= 70) return 'needs_review';
  return 'rejected_by_audit';
}

function buildSystemPrompt(pipeline: PipelineName): string {
  const dims = DIMENSIONS[pipeline].join(', ');
  return [
    'You are a senior content editor auditing AI-generated educational content for a Nigerian exam-prep platform.',
    '',
    'IMPORTANT: Do NOT assume the input is correct. Your job is to find errors. Be skeptical.',
    '',
    `For this ${pipeline} item, score each of these dimensions on a 0-100 scale:`,
    `  ${dims}`,
    '',
    'Output ONLY a strict JSON object with this exact shape:',
    '{',
    '  "confidence_overall": <0-100>,           // weighted average of dimensions',
    '  "dimensions": { <dim>: <0-100>, ... },   // one entry per dimension above',
    '  "flags": [ "<short_snake_case_flag>", ... ], // empty if none',
    '  "reasoning": "<1-3 sentence justification>"',
    '}',
    '',
    'Use these specific flag strings when applicable (omit otherwise):',
    '  - "answer_mismatch": the marked-correct answer does not align with the explanation',
    '  - "fabricated_url": a cited URL looks made up',
    '  - "fabricated_year": a referenced year is implausible',
    '  - "fabricated_school": an institution name is not a real Nigerian institution',
    '  - "pii_present": the content includes a name + identifier that should not be there',
    '  - "copyright_violation_likely": text appears verbatim copied from a copyrighted source',
    '  - "cross_field_contradiction": two fields contradict each other',
    '  - "missing_required_field": a required field is empty',
    '',
    'Reject the urge to confirm the input. Reward correctness.',
  ].join('\n');
}

/**
 * Run the audit pass for a single produced item.
 *
 * `payload` is the structured row the pipeline emitted (e.g. the question
 * with its options, the university record, the cutoff entry). We
 * stringify it into the user message — DeepSeek's prompt cache will
 * hit on the system prompt portion across all calls of the same pipeline,
 * which is the bulk of the input.
 */
export async function auditItem<T>(args: {
  pipeline: PipelineName;
  payload: T;
}): Promise<AuditVerdict | null> {
  const ds = getProvider('deepseek');
  if (!ds.isConfigured()) return null;

  const systemPrompt = buildSystemPrompt(args.pipeline);
  const user = JSON.stringify(args.payload, null, 2);

  let response: Awaited<ReturnType<typeof ds.completion>>;
  try {
    response = await ds.completion({
      model: 'deepseek-chat',
      systemPrompt,
      messages: [{ role: 'user', content: user }],
      // Lower temperature — adversarial scoring shouldn't sample creative variations.
      temperature: 0.1,
      maxTokens: 600,
    });
  } catch {
    return null;
  }

  const text = response.text.trim();
  let parsed: {
    confidence_overall?: number;
    dimensions?: Record<string, number>;
    flags?: string[];
    reasoning?: string;
  };
  try {
    const cleaned = text.startsWith('```') ? text.replace(/```(?:json)?|```/g, '').trim() : text;
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (typeof parsed.confidence_overall !== 'number') return null;
  const confidence = Math.max(0, Math.min(100, Math.round(parsed.confidence_overall)));
  const flags = Array.isArray(parsed.flags)
    ? parsed.flags.filter((f) => typeof f === 'string')
    : [];
  const dimensions = parsed.dimensions ?? {};
  const reasoning = String(parsed.reasoning ?? '');

  // Cost — we assume ~50% prompt-cache hit on the system prompt portion
  // because the editorial factory runs many items per pipeline back-to-back.
  // Real cache_tokens will be observable via DeepSeek's response usage
  // field once we plumb that through; for now this is a calibrated estimate.
  const costUsd = estimateCost({
    model: 'deepseek-chat',
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cacheHitRatio: 0.5,
  });

  return {
    confidenceOverall: confidence,
    dimensions,
    flags,
    reasoning,
    verdict: deriveVerdict(confidence, flags),
    costUsd,
    model: 'deepseek-chat',
  };
}

export const __test = { deriveVerdict, DIMENSIONS, CRITICAL_FLAGS, buildSystemPrompt };
