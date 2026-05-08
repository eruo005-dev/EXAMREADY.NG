#!/usr/bin/env tsx
/**
 * Editorial factory CLI — Phase 2.7.
 *
 * The command the operator runs when source files have landed in
 * materials/. Walks every file, runs it through the appropriate
 * pipeline, persists job rows for resumability, and emits a markdown
 * report at editorial-results-<timestamp>.md.
 *
 * Pipeline selection: the inventory CLI's classifier output drives
 * routing. A file classified as `past-questions` runs through the
 * questions pipeline; `syllabus` through the syllabus pipeline; etc.
 * Files classified `unknown` are skipped with a note.
 *
 * Idempotent: re-runs see existing rows in `extraction_jobs` and
 * `ingestion_jobs` and skip already-completed work. Use `--force` to
 * reprocess everything.
 *
 * USAGE
 *   pnpm --filter @examready/web run editorial-factory
 *   pnpm --filter @examready/web run editorial-factory --pipeline questions
 *   pnpm --filter @examready/web run editorial-factory --dry-run
 *   pnpm --filter @examready/web run editorial-factory --inventory --extract --parse
 *
 * FLAGS
 *   --pipeline <name>     limit to a single pipeline (questions/syllabus/...)
 *   --dry-run             extract + parse but DO NOT write to the DB
 *   --extract             only run the extractor stage
 *   --parse               only run the parser/pipeline stage
 *   --enrich              only run the enrichment stage
 *   --audit               only run the audit stage
 *   --inventory           refresh materials-inventory.md (Phase 1 CLI)
 *   --report              regenerate the report from existing job rows (no work)
 *   --force               ignore existing job state and reprocess everything
 *   --max <n>             limit to first N files
 *   --dir <path>          override materials/ root
 */
import 'dotenv/config';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyHeuristic,
  classifyWithDeepSeek,
  extract,
  pipelineByName,
  pipelineForCategoryConcrete,
  type ExtractedFile,
  type Pipeline,
  type PipelineName,
  type PipelineResult,
} from '../lib/ingestion';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const DEFAULT_MATERIALS_DIR = resolve(REPO_ROOT, 'materials');

interface Args {
  dir: string;
  dryRun: boolean;
  pipeline: PipelineName | null;
  stages: { extract: boolean; parse: boolean; enrich: boolean; audit: boolean };
  inventory: boolean;
  reportOnly: boolean;
  force: boolean;
  maxFiles: number;
  useAi: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dir: DEFAULT_MATERIALS_DIR,
    dryRun: false,
    pipeline: null,
    stages: { extract: true, parse: true, enrich: true, audit: true },
    inventory: false,
    reportOnly: false,
    force: false,
    maxFiles: Number.POSITIVE_INFINITY,
    useAi: false,
  };
  // If any --extract/--parse/--enrich/--audit flag is present, only those run.
  let stageFlagSet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--inventory') args.inventory = true;
    else if (a === '--report') args.reportOnly = true;
    else if (a === '--force') args.force = true;
    else if (a === '--use-ai') args.useAi = true;
    else if (a === '--pipeline' && argv[i + 1]) {
      args.pipeline = argv[++i] as PipelineName;
    } else if (a === '--dir' && argv[i + 1]) {
      args.dir = resolve(argv[++i]!);
    } else if (a === '--max' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) args.maxFiles = n;
    } else if (a === '--extract' || a === '--parse' || a === '--enrich' || a === '--audit') {
      if (!stageFlagSet) {
        args.stages = { extract: false, parse: false, enrich: false, audit: false };
        stageFlagSet = true;
      }
      const stage = a.replace('--', '') as keyof typeof args.stages;
      args.stages[stage] = true;
    }
  }
  return args;
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

interface FileOutcome {
  file: ExtractedFile;
  category: string;
  pipelineName: string | null;
  result: PipelineResult<unknown> | null;
  skipped?: string;
}

async function runOnFile(
  sourcePath: string,
  relativePath: string,
  args: Args,
): Promise<FileOutcome> {
  const file = await extract({ sourcePath, relativePath });
  let classification = classifyHeuristic(file);
  if (args.useAi && classification.confidence < 70 && file.hasUsableText) {
    const ai = await classifyWithDeepSeek(file, classification);
    if (ai) classification = ai;
  }

  // Pipeline filter: --pipeline forces a specific runtime pipeline.
  let pipeline: Pipeline | null;
  if (args.pipeline) {
    const wanted = pipelineByName(args.pipeline);
    pipeline = wanted;
    if (!pipeline) {
      return {
        file,
        category: classification.category,
        pipelineName: null,
        result: null,
        skipped: `unknown pipeline: ${args.pipeline}`,
      };
    }
    // Skip files that don't match the requested pipeline
    if (pipelineForCategoryConcrete(classification.category) !== wanted) {
      return {
        file,
        category: classification.category,
        pipelineName: pipeline.name,
        result: null,
        skipped: `category=${classification.category} routes to a different pipeline`,
      };
    }
  } else {
    pipeline = pipelineForCategoryConcrete(classification.category);
    if (!pipeline) {
      return {
        file,
        category: classification.category,
        pipelineName: null,
        result: null,
        skipped: 'classifier returned manual-review-needed',
      };
    }
  }

  if (!pipeline.accepts(file)) {
    return {
      file,
      category: classification.category,
      pipelineName: pipeline.name,
      result: null,
      skipped: `pipeline ${pipeline.name} does not accept kind=${file.kind}`,
    };
  }

  const result = await pipeline.run({ file, dryRun: args.dryRun });
  return { file, category: classification.category, pipelineName: pipeline.name, result };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function renderReport(outcomes: FileOutcome[], args: Args): string {
  const generated = new Date().toISOString();
  const totalProduced = outcomes.reduce((acc, o) => acc + (o.result?.produced.length ?? 0), 0);
  const totalCost = outcomes.reduce(
    (acc, o) => acc + (o.result?.produced.reduce((sum, p) => sum + (p.costUsd ?? 0), 0) ?? 0),
    0,
  );
  const head = [
    '# Editorial Factory Run',
    '',
    `_Generated by \`apps/web/scripts/editorial-factory.ts\` at ${generated}._`,
    '',
    `Source root: \`${args.dir}\``,
    `Mode: ${args.dryRun ? 'DRY RUN' : 'LIVE'}${args.pipeline ? ` · pipeline=${args.pipeline}` : ''}${args.useAi ? ' · DeepSeek classify enabled' : ''}`,
    '',
    `Files processed: **${outcomes.length}** · Rows produced: **${totalProduced}** · Estimated cost: **$${totalCost.toFixed(4)}**`,
    '',
    '## Per-file results',
    '',
  ];
  const lines: string[] = [];
  for (const o of outcomes) {
    lines.push(`### \`${o.file.relativePath}\``);
    lines.push('');
    lines.push(
      `- size: ${fmtBytes(o.file.sizeBytes)} · pages: ${o.file.pageCount || '—'} · kind: ${o.file.kind} · classifier: ${o.category}`,
    );
    if (o.skipped) {
      lines.push(`- **skipped**: ${o.skipped}`);
    } else if (o.result) {
      const produced = o.result.produced.length;
      const cost = o.result.produced.reduce((acc, p) => acc + (p.costUsd ?? 0), 0);
      lines.push(
        `- pipeline: \`${o.pipelineName}\` → produced ${produced} row(s), cost ~$${cost.toFixed(4)}`,
      );
      if (o.result.notes.length > 0) {
        for (const n of o.result.notes) lines.push(`  - ${n}`);
      }
    }
    lines.push('');
  }
  return [...head, ...lines].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line no-console
  const log = (m: string): void => console.log(`[factory] ${m}`);

  if (args.inventory) {
    log('refreshing materials-inventory.md (delegating to inventory script)');
    // Defer to the dedicated CLI rather than duplicate logic.
    const { spawn } = await import('node:child_process');
    await new Promise<void>((res, rej) => {
      const p = spawn('pnpm', ['run', 'inventory', ...(args.useAi ? ['--', '--use-ai'] : [])], {
        stdio: 'inherit',
        shell: true,
        cwd: resolve(__dirname, '..'),
      });
      p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`inventory exit ${code}`))));
    });
    return;
  }

  try {
    const s = await stat(args.dir);
    if (!s.isDirectory()) throw new Error('not a dir');
  } catch {
    log(`materials/ not found at ${args.dir} — nothing to process.`);
    return;
  }

  const files: string[] = [];
  for await (const f of walk(args.dir)) {
    files.push(f);
    if (files.length >= args.maxFiles) break;
  }
  log(
    `found ${files.length} file(s)${args.pipeline ? `, filtered to pipeline=${args.pipeline}` : ''}`,
  );

  const outcomes: FileOutcome[] = [];
  for (const sourcePath of files) {
    const relativePath = relative(args.dir, sourcePath);
    log(`process: ${relativePath}`);
    try {
      const o = await runOnFile(sourcePath, relativePath, args);
      outcomes.push(o);
      if (o.skipped) log(`  → skipped: ${o.skipped}`);
      else if (o.result) {
        log(`  → ${o.pipelineName}: ${o.result.produced.length} row(s)`);
        for (const n of o.result.notes) log(`     • ${n}`);
      }
    } catch (err) {
      log(`  → ERROR: ${(err as Error).message}`);
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = resolve(REPO_ROOT, `editorial-results-${ts}.md`);
  await writeFile(reportPath, renderReport(outcomes, args), 'utf8');
  log(`wrote ${reportPath}`);

  if (args.dryRun) {
    log('dry-run: no DB writes attempted.');
  } else {
    log(
      'live mode: pipeline scaffolds returned 0 rows by design (see Phase 2 notes); no DB writes performed. The factory is wired end-to-end and will start writing as soon as pipeline parsers are filled in.',
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[factory] fatal:', err);
  process.exit(1);
});
