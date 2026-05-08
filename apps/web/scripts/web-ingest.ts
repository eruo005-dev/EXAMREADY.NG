#!/usr/bin/env tsx
/**
 * Web ingestion CLI — Phase 3.6.
 *
 * Drives the scraper registry. Each --source × --type pair invokes the
 * matching scraper, which goes through fetch.ts (cache + robots.txt +
 * rate limit + SSRF-safe origin allow-list) and hands rows to the
 * appropriate pipeline.
 *
 * USAGE
 *   pnpm --filter @examready/web run web-ingest --source wikipedia --type universities
 *   pnpm --filter @examready/web run web-ingest --source jamb --type syllabus
 *   pnpm --filter @examready/web run web-ingest --source myschool --type cutoffs --dry-run
 *
 * FLAGS
 *   --source <name>   one of: jamb, waec, neco, wikipedia, nuc, myschool
 *   --type <kind>     one of: syllabus, universities, cutoffs, combinations, reference
 *   --dry-run         fetch but don't hand rows to pipelines or write to DB
 *   --max <n>         hard cap on pages fetched
 *   --bypass-cache    force fresh network fetch
 */
import 'dotenv/config';

import {
  getScraper,
  SCRAPER_SOURCES,
  type ScraperSource,
  type ScraperType,
} from '../lib/ingestion/scrapers';

interface Args {
  source: ScraperSource | null;
  type: ScraperType | null;
  dryRun: boolean;
  maxPages: number;
  bypassCache: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    source: null,
    type: null,
    dryRun: false,
    maxPages: Number.POSITIVE_INFINITY,
    bypassCache: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source' && argv[i + 1]) args.source = argv[++i] as ScraperSource;
    else if (a === '--type' && argv[i + 1]) args.type = argv[++i] as ScraperType;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--bypass-cache') args.bypassCache = true;
    else if (a === '--max' && argv[i + 1]) args.maxPages = Number(argv[++i]);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line no-console
  const log = (m: string): void => console.log(`[web-ingest] ${m}`);

  if (!args.source) {
    log(`error: --source is required. Choices: ${SCRAPER_SOURCES.join(', ')}`);
    process.exit(2);
  }
  if (!args.type) {
    log('error: --type is required (syllabus | universities | cutoffs | combinations | reference)');
    process.exit(2);
  }
  const scraper = getScraper(args.source);
  if (!scraper) {
    log(`error: unknown source "${args.source}"`);
    process.exit(2);
  }
  if (!scraper.types.includes(args.type)) {
    log(
      `error: source "${args.source}" does not provide type "${args.type}" (supported: ${scraper.types.join(', ')})`,
    );
    process.exit(2);
  }

  log(`source=${args.source} type=${args.type} dryRun=${args.dryRun}`);
  try {
    const result = await scraper.run({
      source: args.source,
      type: args.type,
      dryRun: args.dryRun,
      maxPages: args.maxPages,
    });
    log(`pages fetched: ${result.pagesFetched}, rows produced: ${result.rowsProduced}`);
    for (const note of result.notes) log(`  • ${note}`);
  } catch (err) {
    log(`fatal: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[web-ingest] fatal:', err);
  process.exit(1);
});
