/**
 * University pipeline — extracts institution metadata from list documents
 * (Wikipedia HTML, NUC scrape, JAMB approved-institutions PDF).
 *
 * Output: rows for the `universities` table. Idempotent on slug — re-runs
 * upsert by slug rather than duplicate.
 *
 * Phase 7 ships the scaffold + the DeepSeek system prompt. The parser
 * for institution-list HTML pages lives in `pipelines/scrapers/wikipedia.ts`
 * (Phase 3) — this pipeline accepts already-scraped HTML or PDF text and
 * normalises into rows.
 */
import { auditItem } from '../audit';
import { batchEnrich } from '../enricher';
import type { ExtractedFile } from '../types';

import { slugify } from './syllabus';
import type { Pipeline, PipelineResult, PipelineRunArgs } from './types';

export interface ProducedUniversity {
  name: string;
  slug: string;
  fullName?: string;
  type:
    | 'federal'
    | 'state'
    | 'private'
    | 'polytechnic-federal'
    | 'polytechnic-state'
    | 'polytechnic-private'
    | 'monotechnic'
    | 'college-of-education'
    | 'innovation-enterprise-institution'
    | 'specialised'
    | 'other';
  state: string;
  website?: string;
  jambCode?: string;
  establishedYear?: number;
  description?: string;
  source: string;
}

class UniversityPipeline implements Pipeline<ProducedUniversity> {
  readonly name = 'university' as const;

  accepts(file: ExtractedFile): boolean {
    return file.kind === 'pdf' || file.kind === 'html' || file.kind === 'text';
  }

  async run(args: PipelineRunArgs): Promise<PipelineResult<ProducedUniversity>> {
    const { file, dryRun = false } = args;
    const notes: string[] = [];
    if (!file.hasUsableText) {
      notes.push(`${file.relativePath}: no usable text — extract first.`);
      return { pipeline: this.name, produced: [], notes };
    }

    // Heuristic: each line of the form
    //   "<NAME>, <STATE>" or "<NAME> (<TYPE>) - <STATE>"
    // is candidate row. We surface candidate names but defer full parsing
    // to the DeepSeek call so abbreviations + alt names get normalised.
    const lineRe =
      /([A-Z][A-Za-z .,'\-\/]+(?:University|Polytechnic|College|Institute|Academy)[^,\n]*)/g;
    const candidates = Array.from(new Set(file.preview.match(lineRe) ?? []));
    notes.push(`${file.relativePath}: ${candidates.length} institution-shaped name(s) detected.`);

    notes.push(
      'parser-scaffold: full normalisation prompt activates once a Wikipedia/NUC source is wired (Phase 3 web ingestion).',
    );

    if (dryRun) return { pipeline: this.name, produced: [], notes };

    // Phase-3-ready: when scraper hands rows in, this pipeline calls
    // DeepSeek to fill state, type, jamb code, description per row,
    // then audit.
    const produced: PipelineResult<ProducedUniversity>['produced'] = [];

    if (produced.length > 0) {
      const enriched = await batchEnrich<ProducedUniversity, ProducedUniversity>({
        pipeline: 'university',
        items: produced.map((p) => ({ key: p.key, raw: p.row })),
        systemPrompt: SYSTEM_ENRICH,
        renderItem: (u) => JSON.stringify({ name: u.name }),
        parseItem: (j) => (typeof j === 'object' && j ? (j as ProducedUniversity) : null),
      });
      for (const p of produced) {
        const e = enriched.get(p.key);
        if (e?.enriched) ((p.row = e.enriched), (p.costUsd += e.costUsd));
        p.audit = await auditItem({ pipeline: 'university', payload: p.row });
        if (p.audit) p.costUsd += p.audit.costUsd;
      }
    }

    return { pipeline: this.name, produced, notes };
  }
}

const SYSTEM_ENRICH = [
  'You are a researcher cataloguing Nigerian higher-education institutions.',
  '',
  'For each input name, return JSON with:',
  '  - name (canonical), full_name (with city if relevant)',
  '  - type: one of federal, state, private, polytechnic-federal, polytechnic-state,',
  '    polytechnic-private, monotechnic, college-of-education,',
  '    innovation-enterprise-institution, specialised, other',
  '  - state: the Nigerian state of the main campus',
  '  - website: HTTPS URL or null if you are not certain',
  '  - jamb_code: short JAMB brochure code or null',
  '  - established_year: integer or null',
  '  - description: 1 paragraph (max 320 chars) describing the institution',
  '',
  'Constraints:',
  '  - DO NOT fabricate. If unsure, return null.',
  "  - Use facts that would be on the institution's own website.",
  '',
  'Return a JSON ARRAY.',
].join('\n');

export { slugify };
export const universityPipeline = new UniversityPipeline();
