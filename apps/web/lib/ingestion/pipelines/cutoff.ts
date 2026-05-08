/**
 * Cutoff-marks pipeline — extracts per (university × course × year) UTME
 * cutoff scores from aggregator pages (Myschool publishes these every
 * year; some university admissions portals do too).
 *
 * Output: rows for `cutoff_marks`. Idempotent on (university, course, year).
 *
 * No DeepSeek enrichment is needed for the numeric value itself — but
 * we DO send each candidate row through the audit pass to flag obvious
 * fabrication (e.g. cutoff=350 for a course that historically asks 180).
 */
import { auditItem } from '../audit';
import type { ExtractedFile } from '../types';

import type { Pipeline, PipelineResult, PipelineRunArgs } from './types';

export interface ProducedCutoff {
  universitySlug: string;
  courseSlug: string;
  year: number;
  cutoffScore?: number;
  aggregateCutoff?: number;
  notes?: string;
  sourceUrl: string;
}

class CutoffPipeline implements Pipeline<ProducedCutoff> {
  readonly name = 'cutoff' as const;

  accepts(file: ExtractedFile): boolean {
    return file.kind === 'html' || file.kind === 'text' || file.kind === 'csv';
  }

  async run(args: PipelineRunArgs): Promise<PipelineResult<ProducedCutoff>> {
    const { file, dryRun = false } = args;
    const notes: string[] = [];
    if (!file.hasUsableText) {
      notes.push(`${file.relativePath}: extract first.`);
      return { pipeline: this.name, produced: [], notes };
    }

    // Aggregator tables typically render as: <School> <Course> <Year> <Score>
    // or as CSV rows. Heuristic detection only at this stage.
    const tabularLines = file.preview
      .split(/\n+/)
      .filter((l) => /\d{4}/.test(l) && /\b\d{2,3}\b/.test(l));
    notes.push(`${file.relativePath}: ${tabularLines.length} cutoff-shaped row(s) detected.`);

    notes.push(
      'parser-scaffold: cutoff extraction lights up when a Phase-3 scraper feeds normalised rows into this pipeline.',
    );

    if (dryRun) return { pipeline: this.name, produced: [], notes };

    const produced: PipelineResult<ProducedCutoff>['produced'] = [];

    // No enrichment for cutoffs — go straight to audit. Audit is the only
    // safety net against fabricated numbers.
    for (const p of produced) {
      p.audit = await auditItem({ pipeline: 'cutoff', payload: p.row });
      if (p.audit) p.costUsd += p.audit.costUsd;
    }

    return { pipeline: this.name, produced, notes };
  }
}

export const cutoffPipeline = new CutoffPipeline();
