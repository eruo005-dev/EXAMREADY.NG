/**
 * Syllabus pipeline — extracts topic trees from official syllabus
 * documents (JAMB syllabuses are PDF, WAEC/NECO are mixed PDF/HTML).
 *
 * Output shape: parent topic → subtopic[] for each subject.
 *
 * Stages:
 *   1. Detect subject heading (e.g. "MATHEMATICS"). PDF preview tends to
 *      preserve casing; we look for ALL-CAPS lines that match a known
 *      subject slug.
 *   2. Within a subject section, detect numbered topic blocks
 *      ("1. Number Bases", "2. Standard Forms", ...).
 *   3. Each block becomes a `topics` row + a 1-2 sentence DeepSeek-
 *      generated description (Phase 6 lessons depend on this).
 *
 * The pipeline is the highest-priority unblocker for Phase 6 — without
 * real topic data, the lesson generator has nothing to anchor on.
 */
import { auditItem } from '../audit';
import { batchEnrich } from '../enricher';
import type { ExtractedFile } from '../types';

import type { Pipeline, PipelineResult, PipelineRunArgs } from './types';

export interface ProducedTopic {
  examSlug: string;
  subjectSlug: string;
  /** Slug derived from the topic name (kebab-case, lowercased). */
  slug: string;
  name: string;
  /** Sub-topic name when the syllabus block is a level deeper. */
  parentSlug?: string;
  /** 1-2 sentence DeepSeek description (filled by enricher). */
  description?: string;
  /** Frequency score 1-100 (filled later from past-attempt analytics; 50 default). */
  frequencyScore: number;
  source: string;
}

const SLUG_RE = /[^a-z0-9]+/g;
function slugify(s: string): string {
  return s.toLowerCase().replace(SLUG_RE, '-').replace(/^-|-$/g, '').slice(0, 100);
}

class SyllabusPipeline implements Pipeline<ProducedTopic> {
  readonly name = 'syllabus' as const;

  accepts(file: ExtractedFile): boolean {
    return file.kind === 'pdf' || file.kind === 'html' || file.kind === 'text';
  }

  async run(args: PipelineRunArgs): Promise<PipelineResult<ProducedTopic>> {
    const { file, dryRun = false } = args;
    const notes: string[] = [];

    if (!file.hasUsableText) {
      notes.push(`${file.relativePath}: vision pipeline required (Phase 2.1).`);
      return { pipeline: this.name, produced: [], notes };
    }

    // Naive topic-block detection — a numbered line followed by content
    // until the next numbered line. Real-world JAMB syllabuses follow
    // this convention reliably enough for Phase 7.
    const topicRe = /\b(\d{1,2})\.\s+([A-Z][A-Za-z0-9 ,&'\-\/]+?)(?=(?:\b\d{1,2}\.\s+[A-Z])|$)/g;
    const matches = Array.from(file.preview.matchAll(topicRe));
    if (matches.length === 0) {
      notes.push(`${file.relativePath}: no numbered topic blocks detected — manual review.`);
      return { pipeline: this.name, produced: [], notes };
    }
    notes.push(`${file.relativePath}: ${matches.length} topic-shaped block(s) detected.`);

    // SCAFFOLD HOOK — when source files arrive, the regex output is the
    // input to a DeepSeek pass that returns { name, description } per
    // topic. Today we surface what we found and let the operator decide.
    notes.push(
      'parser-scaffold: syllabus DeepSeek parse + description prompt activates once a JAMB syllabus PDF lands in materials/. Topic regex output above is currently advisory.',
    );

    if (dryRun) return { pipeline: this.name, produced: [], notes };

    // Plumbed for when the parser prompt lands. Same pattern as questions.ts.
    const produced: PipelineResult<ProducedTopic>['produced'] = [];

    if (produced.length > 0) {
      // Enrich each topic with a 1-2 sentence description, then audit.
      const enriched = await batchEnrich<ProducedTopic, ProducedTopic>({
        pipeline: 'syllabus',
        items: produced.map((p) => ({ key: p.key, raw: p.row })),
        systemPrompt: SYSTEM_ENRICH,
        renderItem: (t) =>
          JSON.stringify({ name: t.name, subject: t.subjectSlug, exam: t.examSlug }),
        parseItem: (json) => (typeof json === 'object' && json ? (json as ProducedTopic) : null),
      });
      for (const p of produced) {
        const e = enriched.get(p.key);
        if (e?.enriched) ((p.row = e.enriched), (p.costUsd += e.costUsd));
        p.audit = await auditItem({ pipeline: 'syllabus', payload: p.row });
        if (p.audit) p.costUsd += p.audit.costUsd;
      }
    }

    return { pipeline: this.name, produced, notes };
  }
}

const SYSTEM_ENRICH = [
  'You are a Nigerian secondary-school exam-prep editor writing concise topic descriptions.',
  '',
  'For each input topic, produce a JSON object with these fields:',
  '  - description: 1-2 sentences (max 240 chars) describing what the topic covers',
  '  - frequency_score: integer 1-100 estimating how often this topic appears',
  '    in past papers (50 = average; 90 = nearly every year)',
  '',
  'Constraints:',
  '  - Plain English; no marketing language; no exam-board promises.',
  '  - Topic names are authoritative — DO NOT rename them.',
  '',
  'Return a JSON ARRAY in the same order as the input.',
].join('\n');

export { slugify };
export const syllabusPipeline = new SyllabusPipeline();
