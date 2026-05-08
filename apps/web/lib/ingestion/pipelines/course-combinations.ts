/**
 * Course combinations pipeline — extracts JAMB subject combinations and
 * O-level requirements from JAMB faculty brochures.
 *
 * Brochure structure (each is one PDF):
 *   - Faculty header (e.g. "FACULTY OF ENGINEERING")
 *   - Per course: name, UTME subjects, O-level requirements, university list
 *
 * The JAMB brochures in materials/ (12 files, ~5 MB total) are the
 * canonical source for this pipeline. Output rows split into two tables:
 *   - `courses` — one row per unique course name
 *   - `university_courses` — one row per (university, course) edge with
 *     per-institution overrides where they differ from the course default
 *
 * Idempotent: course slug is the dedupe key; (university_id, course_id)
 * is the dedupe key for the join.
 */
import { auditItem } from '../audit';
import { batchEnrich } from '../enricher';
import type { ExtractedFile } from '../types';

import { slugify } from './syllabus';
import type { Pipeline, PipelineResult, PipelineRunArgs } from './types';

export interface ProducedCourseCombination {
  courseName: string;
  courseSlug: string;
  faculty?: string;
  /** Multiple combinations are common — Pharmacy accepts 2+ depending on uni. */
  jambSubjectCombinations: string[][];
  olevelRequirements: { mandatory: string[]; anyOf?: string[][]; minPasses: number };
  /** Universities that offer this combination (slugs). */
  universitySlugs: string[];
  source: string;
}

class CourseCombinationsPipeline implements Pipeline<ProducedCourseCombination> {
  readonly name = 'course-combinations' as const;

  accepts(file: ExtractedFile): boolean {
    return file.kind === 'pdf' || file.kind === 'text';
  }

  async run(args: PipelineRunArgs): Promise<PipelineResult<ProducedCourseCombination>> {
    const { file, dryRun = false } = args;
    const notes: string[] = [];

    if (!file.hasUsableText) {
      notes.push(`${file.relativePath}: vision needed.`);
      return { pipeline: this.name, produced: [], notes };
    }

    // Detect "FACULTY OF X" headers — JAMB brochures have one per file.
    const facultyMatch = file.preview.match(/FACULTY OF ([A-Z &/-]+)/);
    const faculty = facultyMatch?.[1]?.trim() ?? undefined;
    if (faculty) notes.push(`${file.relativePath}: faculty="${faculty}"`);

    // Heuristic: course names tend to appear ALL-CAPS or Title Case
    // followed by a "UTME SUBJECTS:" label in the brochure. We surface
    // candidate names; full structured parse is a DeepSeek call (deferred).
    const courseRe = /([A-Z][A-Za-z &,()\/'\-]{4,80})\s*\n\s*(?:UTME SUBJECTS|UTME)/g;
    const candidates = Array.from(new Set(file.preview.match(courseRe) ?? []));
    notes.push(`${file.relativePath}: ${candidates.length} candidate course block(s).`);

    notes.push(
      "parser-scaffold: full DeepSeek extraction prompt activates when an admin runs the factory CLI on these brochures. Each brochure currently emits 0 rows so we don't insert fabricated combinations.",
    );

    if (dryRun) return { pipeline: this.name, produced: [], notes };

    const produced: PipelineResult<ProducedCourseCombination>['produced'] = [];

    if (produced.length > 0) {
      const enriched = await batchEnrich<ProducedCourseCombination, ProducedCourseCombination>({
        pipeline: 'course-combinations',
        items: produced.map((p) => ({ key: p.key, raw: p.row })),
        systemPrompt: SYSTEM_ENRICH,
        renderItem: (c) => JSON.stringify({ name: c.courseName, faculty: c.faculty }),
        parseItem: (j) => (typeof j === 'object' && j ? (j as ProducedCourseCombination) : null),
      });
      for (const p of produced) {
        const e = enriched.get(p.key);
        if (e?.enriched) ((p.row = e.enriched), (p.costUsd += e.costUsd));
        p.audit = await auditItem({ pipeline: 'course-combinations', payload: p.row });
        if (p.audit) p.costUsd += p.audit.costUsd;
      }
    }

    return { pipeline: this.name, produced, notes };
  }
}

const SYSTEM_ENRICH = [
  'You are a Nigerian university admissions advisor.',
  '',
  'For each course, return JSON with:',
  '  - jamb_subject_combinations: array of arrays of subject slugs, e.g.',
  '    [["english-language","mathematics","physics","chemistry"]]',
  '  - olevel_requirements: { mandatory: <string[]>, anyOf: <string[][]>?, minPasses: <int> }',
  '  - duration_years: typical degree duration',
  '  - career_paths: array of strings (3-5 items)',
  '',
  'Use the standard JAMB brochure subject codes. DO NOT invent combinations not in current brochures.',
  'Return a JSON ARRAY.',
].join('\n');

export { slugify };
export const courseCombinationsPipeline = new CourseCombinationsPipeline();
