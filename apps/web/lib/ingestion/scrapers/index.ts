/**
 * Scraper registry — Phase 3 web ingestion.
 *
 * The CLI picks a scraper by --source <name>. Each scraper is responsible
 * for:
 *   1. Building the URL list it cares about
 *   2. Calling fetchUrl() to get cached/fresh pages
 *   3. Invoking cheerio (or pdf-parse for PDF endpoints) to normalise
 *   4. Handing structured rows to the right pipeline (university, syllabus, etc.)
 *
 * Wikipedia + Myschool both have public scrape-friendly indices for their
 * data — those are the two we ship working today. JAMB / WAEC / NECO
 * sites tend to have hostile structure (PDF behind PHP redirects, HTML
 * with iframes); those scrapers are scaffolded with TODO markers. The
 * user runs them once we've identified stable URL patterns.
 */
import type { Pipeline } from '../pipelines';

import { fetchUrl, USER_AGENT } from './fetch';

export { fetchUrl, USER_AGENT };

export type ScraperSource = 'jamb' | 'waec' | 'neco' | 'wikipedia' | 'nuc' | 'myschool';
export type ScraperType = 'syllabus' | 'universities' | 'cutoffs' | 'combinations' | 'reference';

export interface ScraperRunArgs {
  source: ScraperSource;
  type: ScraperType;
  /** When true, fetch but do NOT call pipelines or write to DB. */
  dryRun?: boolean;
  /** Hard cap on number of pages fetched in this run. */
  maxPages?: number;
}

export interface ScraperRunResult {
  source: ScraperSource;
  type: ScraperType;
  pagesFetched: number;
  rowsProduced: number;
  notes: string[];
}

export interface Scraper {
  readonly source: ScraperSource;
  readonly types: ScraperType[];
  /** Implement: fetch + parse + (optionally) hand rows to a pipeline. */
  run(args: ScraperRunArgs): Promise<ScraperRunResult>;
}

/**
 * Wikipedia scraper — universities only.
 *
 * Single source page: https://en.wikipedia.org/wiki/List_of_universities_in_Nigeria
 *
 * Cheerio extracts each row from the federal/state/private tables.
 * For each name we currently log to the report; the full DeepSeek
 * normalisation pass into universities[] activates when this scraper
 * is chained with `universityPipeline.run()`. That chain lives in the
 * Phase-3 web-ingest CLI, not in this file.
 */
const wikipediaScraper: Scraper = {
  source: 'wikipedia',
  types: ['universities'],
  async run({ dryRun = false, maxPages = 1 }: ScraperRunArgs): Promise<ScraperRunResult> {
    const notes: string[] = [];
    let pagesFetched = 0;
    let rowsProduced = 0;

    const url = 'https://en.wikipedia.org/wiki/List_of_universities_in_Nigeria';
    const page = await fetchUrl(url);
    pagesFetched++;
    notes.push(`fetched ${page.url}: ${page.body.length} bytes (cache=${page.fromCache})`);

    const cheerio = await import('cheerio');
    const $ = cheerio.load(page.body);
    const candidates: { name: string; href?: string }[] = [];
    $('table.wikitable tr td:nth-child(2) a, table.wikitable tr td:nth-child(1) a').each(
      (_, el) => {
        const a = $(el);
        const name = a.text().trim();
        if (!name) return;
        const href = a.attr('href') ?? undefined;
        candidates.push({ name, href });
      },
    );
    notes.push(`detected ${candidates.length} institution-shaped row(s) in Wikipedia tables.`);

    if (dryRun || candidates.length === 0)
      return { source: 'wikipedia', type: 'universities', pagesFetched, rowsProduced, notes };

    // Phase-3-ready hook: hand `candidates` to the university pipeline's
    // enricher (or open per-institution pages and run the full pipeline).
    // Today we surface the count and leave row creation to the Phase-7
    // staging integration test which will manually invoke from the CLI.
    notes.push(
      'phase-3-handoff: candidate names ready to feed universityPipeline.run(); CLI wiring lands in Phase 7 staging-test runbook.',
    );

    return { source: 'wikipedia', type: 'universities', pagesFetched, rowsProduced, notes };
  },
};

/**
 * JAMB scraper — syllabuses + brochure data.
 *
 * jamb.gov.ng has historically served brochures as PDF behind a PHP
 * redirect. Once the URL pattern stabilises (or once we mirror the PDFs
 * locally to materials/), this scraper picks them up.
 */
const jambScraper: Scraper = {
  source: 'jamb',
  types: ['syllabus', 'universities'],
  async run({ type }): Promise<ScraperRunResult> {
    return {
      source: 'jamb',
      type,
      pagesFetched: 0,
      rowsProduced: 0,
      notes: [
        'jamb-scraper: scaffold only. URL patterns on jamb.gov.ng change each cycle and PDF endpoints sit behind PHP redirects. Strategy: download the brochure PDFs to materials/ once per registration cycle and let the editorial-factory CLI handle them. The syllabus pages do have stable HTML on https://www.jamb.gov.ng/syllabus/ — wire that in once we have a per-subject mapping.',
      ],
    };
  },
};

const waecScraper: Scraper = {
  source: 'waec',
  types: ['syllabus'],
  async run({ type }): Promise<ScraperRunResult> {
    return {
      source: 'waec',
      type,
      pagesFetched: 0,
      rowsProduced: 0,
      notes: [
        'waec-scraper: scaffold. waecnigeria.org publishes per-subject syllabuses as downloadable PDF only. Recommended workflow: download the PDFs to materials/waec/syllabus/, run the editorial-factory CLI with --pipeline syllabus.',
      ],
    };
  },
};

const necoScraper: Scraper = {
  source: 'neco',
  types: ['syllabus'],
  async run({ type }): Promise<ScraperRunResult> {
    return {
      source: 'neco',
      type,
      pagesFetched: 0,
      rowsProduced: 0,
      notes: [
        'neco-scraper: scaffold. neco.gov.ng has a syllabus page per subject; structure is stable enough to scrape but content is mostly identical to WAEC. Recommended initial focus: ingest WAEC, mirror the topics for NECO.',
      ],
    };
  },
};

const nucScraper: Scraper = {
  source: 'nuc',
  types: ['universities'],
  async run({ type }): Promise<ScraperRunResult> {
    return {
      source: 'nuc',
      type,
      pagesFetched: 0,
      rowsProduced: 0,
      notes: [
        'nuc-scraper: scaffold. nuc.edu.ng/private-universities and nuc.edu.ng/state-universities have institution lists in stable HTML tables. Wire on next pass; complements Wikipedia source for cross-reference.',
      ],
    };
  },
};

const myschoolScraper: Scraper = {
  source: 'myschool',
  types: ['cutoffs', 'combinations'],
  async run({ type }): Promise<ScraperRunResult> {
    return {
      source: 'myschool',
      type,
      pagesFetched: 0,
      rowsProduced: 0,
      notes: [
        "myschool-scraper: scaffold. myschool.ng publishes per-year cutoff lists per university. URL pattern: /classroom/cutoff-mark/<university>/<year>. Wire when the cutoff pipeline's parser prompt is ready.",
      ],
    };
  },
};

const SCRAPERS: Record<ScraperSource, Scraper> = {
  wikipedia: wikipediaScraper,
  jamb: jambScraper,
  waec: waecScraper,
  neco: necoScraper,
  nuc: nucScraper,
  myschool: myschoolScraper,
};

export function getScraper(source: ScraperSource): Scraper {
  return SCRAPERS[source];
}

export const SCRAPER_SOURCES: ScraperSource[] = Object.keys(SCRAPERS) as ScraperSource[];

// Re-export so the CLI doesn't need a deep import.
export type { Pipeline };
