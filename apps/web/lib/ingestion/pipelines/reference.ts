/**
 * Reference pipeline — catch-all for general-purpose content that doesn't
 * fit the structured pipelines: study notes, exam-information leaflets,
 * blog source material, prescribed-text summaries.
 *
 * Output rows go to `reference_content` (Sprint 7 schema). Each row is a
 * markdown body + metadata (kind, optional topic_id / exam_id linkage).
 *
 * The Phase 6 lesson generator reads from this table when it needs
 * factual anchor text for a topic that doesn't have a direct
 * canonical syllabus entry.
 */
import { auditItem } from '../audit';
import type { ExtractedFile } from '../types';

import type { Pipeline, PipelineResult, PipelineRunArgs } from './types';

export interface ProducedReference {
  kind: 'study-notes' | 'exam-information' | 'syllabus-text' | 'reference-article';
  title: string;
  slug?: string;
  topicSlug?: string;
  examSlug?: string;
  /** Sanitised markdown body. */
  content: string;
  wordCount: number;
  source: string;
}

class ReferencePipeline implements Pipeline<ProducedReference> {
  readonly name = 'reference' as const;

  accepts(file: ExtractedFile): boolean {
    return ['pdf', 'docx', 'text', 'html'].includes(file.kind);
  }

  async run(args: PipelineRunArgs): Promise<PipelineResult<ProducedReference>> {
    const { file, dryRun = false } = args;
    const notes: string[] = [];
    if (!file.hasUsableText) {
      notes.push(`${file.relativePath}: extract first.`);
      return { pipeline: this.name, produced: [], notes };
    }

    // For reference content we don't try to chunk — the whole document
    // is one row. We still take a preview-sized slice for the initial
    // commit; the full text lives in the source file (via source path).
    const wordCount = file.preview.split(/\s+/).length;
    notes.push(`${file.relativePath}: ${wordCount} words in preview slice.`);

    notes.push(
      'parser-scaffold: reference content gets full-text DeepSeek summarisation when the operator runs the factory CLI on a known reference doc.',
    );

    if (dryRun) return { pipeline: this.name, produced: [], notes };

    // Reference items skip enrichment (the body IS the content) but go
    // through audit so the editor catches PII / copyright concerns
    // before they hit the lessons generator.
    const produced: PipelineResult<ProducedReference>['produced'] = [];
    for (const p of produced) {
      p.audit = await auditItem({ pipeline: 'reference', payload: p.row });
      if (p.audit) p.costUsd += p.audit.costUsd;
    }

    return { pipeline: this.name, produced, notes };
  }
}

export const referencePipeline = new ReferencePipeline();
