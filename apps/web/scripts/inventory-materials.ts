#!/usr/bin/env tsx
/**
 * Inventory CLI — Phase 1 of the Sprint 7 editorial factory.
 *
 * Walks the materials/ folder at the repo root, runs each file through
 * the extractor + heuristic classifier, optionally calls DeepSeek for
 * borderline cases, and writes a markdown report to materials-inventory.md.
 *
 * USAGE
 *   pnpm --filter @examready/web exec tsx scripts/inventory-materials.ts
 *   pnpm --filter @examready/web exec tsx scripts/inventory-materials.ts --use-ai
 *   pnpm --filter @examready/web exec tsx scripts/inventory-materials.ts --dir /custom/path
 *
 * FLAGS
 *   --use-ai    : call DeepSeek for files with heuristic confidence < 70.
 *                 Requires DEEPSEEK_API_KEY in env. Without the flag the
 *                 CLI runs entirely on heuristics (free).
 *   --dir <p>   : override the default materials/ root path.
 *   --max <n>   : limit to first N files (handy for dry runs).
 *   --json      : also write materials-inventory.json next to the .md.
 *
 * The CLI is idempotent — re-running overwrites the report. It does NOT
 * write to the database. Phase 2's editorial-factory CLI does that.
 */
import 'dotenv/config';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyHeuristic,
  classifyWithDeepSeek,
  extract,
  pipelineForCategory,
  type ClassificationResult,
  type InventoryEntry,
} from '../lib/ingestion';

// ESM-compatible __dirname — same pattern as the other tsx scripts in this
// repo (preflight.ts and packages/db/src/migrate.ts).
const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/ → apps/web/ → apps/ → repo root.
const REPO_ROOT = resolve(__dirname, '../../..');
const DEFAULT_MATERIALS_DIR = resolve(REPO_ROOT, 'materials');
const DEFAULT_REPORT_PATH = resolve(REPO_ROOT, 'materials-inventory.md');

interface Args {
  dir: string;
  useAi: boolean;
  maxFiles: number;
  alsoJson: boolean;
}

function parseArgs(argv: string[]): Args {
  let dir = DEFAULT_MATERIALS_DIR;
  let useAi = false;
  let maxFiles = Number.POSITIVE_INFINITY;
  let alsoJson = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--use-ai') useAi = true;
    else if (a === '--json') alsoJson = true;
    else if (a === '--dir' && argv[i + 1]) {
      dir = resolve(argv[++i]!);
    } else if (a === '--max' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) maxFiles = n;
    }
  }
  return { dir, useAi, maxFiles, alsoJson };
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden + cache directories. Anything else is fair game.
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function recommendation(entry: {
  category: ClassificationResult['category'];
  confidence: number;
}): string {
  const map: Record<ClassificationResult['category'], string> = {
    'past-questions':
      'Drop into materials/<exam>/<year>/<subject>.pdf, then run questions pipeline.',
    syllabus: 'Run syllabus pipeline → populates topics + topic_descriptions.',
    'study-notes': 'Run reference pipeline → indexed for blog/lessons enrichment.',
    'university-list': 'Run university pipeline → populates universities table.',
    'school-list':
      'Run university pipeline (polytechnic/college variant) → universities + faculty rows.',
    'course-requirements':
      'Run course-combinations pipeline (extracts faculty + course + entry requirements).',
    'course-combinations':
      'Run course-combinations pipeline → courses + university_courses tables.',
    'cutoff-marks': 'Run cutoff pipeline → cutoff_marks table.',
    'exam-information':
      'Run reference pipeline (info pages — register, timetable, etc.) for the help center.',
    'reference-content': 'Run reference pipeline → general SEO/blog content stash.',
    unknown: 'Manual review needed — open the file and re-classify.',
  };
  const base = map[entry.category];
  if (entry.confidence < 70) return `${base} (LOW confidence — verify before queuing.)`;
  return base;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function summarise(entries: InventoryEntry[]): string {
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.classification.category, (counts.get(e.classification.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `- **${cat}**: ${n}`)
    .join('\n');
}

function renderMarkdown(entries: InventoryEntry[], ctx: Args): string {
  const generated = new Date().toISOString();
  const totalBytes = entries.reduce((acc, e) => acc + e.file.sizeBytes, 0);
  const aiCount = entries.filter((e) => e.classification.source === 'deepseek').length;

  const head = [
    '# Materials Inventory — Editorial Factory',
    '',
    `_Generated by \`apps/web/scripts/inventory-materials.ts\` at ${generated}._`,
    '',
    `Source root: \`${ctx.dir}\``,
    '',
    `Files scanned: **${entries.length}** · Total size: **${fmtBytes(totalBytes)}** · DeepSeek calls: **${aiCount}**`,
    '',
    '## Category breakdown',
    '',
    summarise(entries) || '_(empty — run the CLI against a non-empty materials/ folder)_',
    '',
    '## Per-file inventory',
    '',
    '| # | File | Size | Pages | Detected category | Confidence | Source | Pipeline | Hints |',
    '|---|------|------|------:|-------------------|-----------:|--------|----------|-------|',
  ];

  const rows = entries.map((e, i) => {
    const file = `\`${e.file.relativePath}\``;
    const size = fmtBytes(e.file.sizeBytes);
    const pages = e.file.pageCount > 0 ? String(e.file.pageCount) : '—';
    const cat = e.classification.category;
    const conf = `${e.classification.confidence}`;
    const src = e.classification.source;
    const pipe = e.pipeline;
    const hints = e.classification.hints
      ? Object.entries(e.classification.hints)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
      : '—';
    return `| ${i + 1} | ${escapePipe(file)} | ${size} | ${pages} | ${cat} | ${conf} | ${src} | ${pipe} | ${escapePipe(hints || '—')} |`;
  });

  const recs = [
    '',
    '## Per-file recommendations',
    '',
    ...entries.map((e, i) => {
      const why = e.classification.reasoning;
      return `${i + 1}. **${e.file.relativePath}** — ${e.recommendation}\n    - _Reason: ${why}_`;
    }),
  ];

  const errors = entries.filter((e) => e.file.extractionError);
  const errorBlock =
    errors.length === 0
      ? []
      : [
          '',
          '## Extraction errors',
          '',
          ...errors.map((e) => `- \`${e.file.relativePath}\` — ${e.file.extractionError}`),
        ];

  const footer = [
    '',
    '---',
    '',
    '## What to do next',
    '',
    '1. Review the categories above — flag any obvious mis-classifications.',
    '2. For files marked **manual-review-needed** or with confidence < 70, open the file and either rename it to give the heuristic a stronger signal, or re-run with `--use-ai` to ask DeepSeek.',
    '3. Once the inventory looks right, run `pnpm --filter @examready/web exec tsx scripts/editorial-factory.ts` to start the full pipeline (Phase 2).',
    '4. Follow [EDITORIAL_FACTORY_README.md](EDITORIAL_FACTORY_README.md) for the end-to-end flow.',
    '',
    '> Note: this report is **not** committed to git (see `.gitignore`). It contains paths that are local to your machine and is regenerated on every CLI run.',
    '',
  ];

  return [...head, ...rows, ...recs, ...errorBlock, ...footer].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line no-console
  const log = (m: string): void => console.log(`[inventory] ${m}`);

  // Sanity check the materials/ directory exists. We treat "missing" as a
  // soft warning, not a crash — the user may not have copied files in yet.
  try {
    const s = await stat(args.dir);
    if (!s.isDirectory()) {
      log(`ERROR: ${args.dir} is not a directory`);
      process.exit(1);
    }
  } catch {
    log(`materials/ folder not found at ${args.dir} — nothing to inventory.`);
    log('Create the folder and drop your source PDFs/DOCX files in.');
    await writeFile(
      DEFAULT_REPORT_PATH,
      `# Materials Inventory\n\n_No files yet. Drop sources into ${args.dir} and re-run._\n`,
      'utf8',
    );
    return;
  }

  const files: string[] = [];
  for await (const f of walk(args.dir)) {
    files.push(f);
    if (files.length >= args.maxFiles) break;
  }
  log(`scanning ${files.length} file(s)`);

  const entries: InventoryEntry[] = [];
  let aiCalls = 0;
  for (const sourcePath of files) {
    const relativePath = relative(args.dir, sourcePath);
    log(`extract: ${relativePath}`);
    const file = await extract({ sourcePath, relativePath });
    let classification = classifyHeuristic(file);

    if (args.useAi && classification.confidence < 70 && file.hasUsableText) {
      log(`  → low confidence (${classification.confidence}); calling DeepSeek`);
      const ai = await classifyWithDeepSeek(file, classification);
      if (ai) {
        aiCalls += 1;
        classification = ai;
      }
    }

    const pipeline = pipelineForCategory(classification.category);
    entries.push({
      file,
      classification,
      pipeline,
      recommendation: recommendation(classification),
    });
  }

  const md = renderMarkdown(entries, args);
  await writeFile(DEFAULT_REPORT_PATH, md, 'utf8');
  log(`wrote ${DEFAULT_REPORT_PATH} (${entries.length} entries, ${aiCalls} AI calls)`);

  if (args.alsoJson) {
    const jsonPath = DEFAULT_REPORT_PATH.replace(/\.md$/, '.json');
    await writeFile(jsonPath, JSON.stringify(entries, null, 2), 'utf8');
    log(`wrote ${jsonPath}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[inventory] fatal:', err);
  process.exit(1);
});
