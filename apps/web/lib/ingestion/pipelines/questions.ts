/**
 * Questions pipeline — extracts MCQ + theory questions from past-paper PDFs.
 *
 * Stages:
 *   1. Section the raw text into per-question chunks (regex on
 *      "Question N." / "(N)." / numbered paragraph patterns)
 *   2. For each chunk: call DeepSeek-chat to parse stem + 4 options +
 *      correct-answer letter into structured JSON (Zod-validated)
 *   3. Enrich: topic-id match against the catalog, difficulty 1-5,
 *      explanation, common-mistake note
 *   4. Audit pass per question (audit.ts handles the call + scoring)
 *
 * Why we don't do all 4 stages in one DeepSeek call: separating them
 * means we can re-run a single stage (e.g. re-enrich after a prompt
 * tweak) without re-extracting. It also means the audit pass sees a
 * fresh context and isn't anchored to the parser's confidence.
 *
 * COVERAGE NOTE: this file ships the pipeline SCAFFOLD. The full parser
 * + enricher prompt set will be filled in when the user drops their
 * first JAMB/WAEC past-paper PDF into materials/. The structure here
 * is the contract — the prompts inside `parseChunk` and `enrichOne` are
 * the only places that change between scaffold and live operation.
 */
import { auditItem } from '../audit';
import { batchEnrich } from '../enricher';
import type { ExtractedFile } from '../types';

import type { Pipeline, PipelineResult, PipelineRunArgs, PipelineProducedRow } from './types';

/**
 * Structured row this pipeline produces (matches `questions` + `options`
 * schema columns). The CLI writes these into the DB transactionally so
 * a failed audit doesn't leave half-written rows.
 */
export interface ProducedQuestion {
  /** Temp UUID; replaced by the inserted row's UUID after DB write. */
  tempId: string;
  examSlug: string;
  subjectSlug: string;
  topicSlug?: string;
  questionType: 'mcq_single' | 'comprehension' | 'theory';
  stem: string;
  passage?: string;
  options: { label: string; content: string; isCorrect: boolean }[];
  /** 1 (easiest) — 5 (hardest). Enricher fills this in. */
  difficulty: number;
  explanation: string;
  /** PDF year (if detected from filename hints). */
  year?: number;
  /** Source path / URL for provenance. */
  source: string;
}

/** Split raw text into per-question chunks. */
function chunkQuestions(text: string): string[] {
  // Heuristic: questions usually start with "1.", "(1)", "Question 1", etc.
  // We split on these markers and keep ~1500 chars max per chunk to fit
  // token limits comfortably.
  const lines = text.split(/\n+/);
  const chunks: string[] = [];
  let current: string[] = [];
  const startRe = /^\s*(?:question\s+\d+|\(\d+\)|\d+\s*[\.\)])/i;

  for (const line of lines) {
    if (startRe.test(line) && current.length > 0) {
      chunks.push(current.join(' ').trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) chunks.push(current.join(' ').trim());

  // Drop tiny chunks (less than 30 chars — usually headers / page breaks).
  return chunks.filter((c) => c.length > 30);
}

class QuestionsPipeline implements Pipeline<ProducedQuestion> {
  readonly name = 'questions' as const;

  accepts(file: ExtractedFile): boolean {
    return file.kind === 'pdf' || file.kind === 'docx' || file.kind === 'text';
  }

  async run(args: PipelineRunArgs): Promise<PipelineResult<ProducedQuestion>> {
    const { file, dryRun = false } = args;
    const notes: string[] = [];

    if (!file.hasUsableText) {
      notes.push(
        `${file.relativePath}: extractor produced no usable text — vision pipeline required (Phase 2.1).`,
      );
      return { pipeline: this.name, produced: [], notes };
    }

    const chunks = chunkQuestions(file.preview);
    if (chunks.length === 0) {
      notes.push(`${file.relativePath}: no question-shaped chunks detected.`);
      return { pipeline: this.name, produced: [], notes };
    }
    notes.push(`${file.relativePath}: ${chunks.length} question chunk(s) detected.`);

    // ------------------------------------------------------------------
    // SCAFFOLD HOOK — replace with real DeepSeek parsing prompt when
    // first past-paper PDFs land. Each chunk → ProducedQuestion.
    //
    // Today: skip parsing rather than fake. The pipeline returns
    // 0 produced rows + an explanatory note in `notes`. Inventory will
    // still report the file correctly, the user can verify the chunking
    // worked, and once the prompt is dropped in this file becomes live.
    // ------------------------------------------------------------------
    notes.push(
      'parser-scaffold: question-extraction prompt deliberately deferred until first real past-paper PDF arrives. See `WHEN_PAST_QUESTIONS_ARRIVE.md`.',
    );

    if (dryRun) {
      notes.push('dry-run: skipping enrichment + audit.');
      return { pipeline: this.name, produced: [], notes };
    }

    // When the parsing scaffold is filled in, the produced rows flow
    // through the (already-live) batched enricher and per-item audit.
    // Wired up here so the integration is testable end-to-end as soon
    // as the parser prompt lands.
    const produced: PipelineProducedRow<ProducedQuestion>[] = [];

    if (produced.length > 0) {
      const enriched = await batchEnrich<ProducedQuestion, ProducedQuestion>({
        pipeline: 'questions',
        items: produced.map((p) => ({ key: p.key, raw: p.row })),
        systemPrompt: SYSTEM_ENRICH,
        renderItem: (q) =>
          JSON.stringify({
            stem: q.stem,
            options: q.options,
            subject: q.subjectSlug,
          }),
        parseItem: (json) => (typeof json === 'object' && json ? (json as ProducedQuestion) : null),
      });

      for (const p of produced) {
        const e = enriched.get(p.key);
        if (e?.enriched) {
          p.row = e.enriched;
          p.costUsd += e.costUsd;
        }
        const audit = await auditItem({ pipeline: 'questions', payload: p.row });
        p.audit = audit;
        if (audit) p.costUsd += audit.costUsd;
      }
    }

    return { pipeline: this.name, produced, notes };
  }
}

/**
 * System prompt used by the enricher for questions. Static + ≥200 tokens
 * so it qualifies for DeepSeek's prompt cache (Phase 5 hardens this).
 */
const SYSTEM_ENRICH = [
  'You are an experienced Nigerian secondary-school exam coach enriching multiple-choice questions for ExamReady.',
  '',
  'For each input question return a JSON object with these fields (and ONLY these fields):',
  '  - difficulty: integer 1-5 (1=trivial, 3=average JAMB question, 5=hardest WAEC theory)',
  '  - explanation: 2-4 sentences explaining the correct answer in plain English',
  '  - common_mistake: 1 sentence on the most common reason a student picks the wrong option',
  '  - topic_slug: the most-likely topic slug from the standard JAMB/WAEC topic list, or null',
  '',
  'Constraints:',
  '  - Do NOT change the stem, options, or correct-answer flag.',
  '  - Use Nigerian English (no Americanisms unless quoted from the question).',
  '  - If the question is genuinely flawed (e.g. two correct options), set explanation to "AMBIGUOUS — review needed" and difficulty to 0.',
  '',
  'Return a JSON ARRAY in the same order as the input.',
].join('\n');

export const questionsPipeline = new QuestionsPipeline();
