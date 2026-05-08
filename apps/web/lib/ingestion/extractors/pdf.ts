/**
 * PDF text extractor.
 *
 * Uses pdf-parse for the fast happy path. If pdf-parse fails (encrypted
 * PDF, malformed structure) or returns < 200 chars per page (likely
 * scanned), we surface that fact via `hasUsableText: false` and let the
 * caller route the file to the vision pipeline (Phase 2.1).
 *
 * Why pdf-parse: zero native deps, runs anywhere Node runs (CI, Vercel,
 * local Windows). The trade-off is no OCR — scanned PDFs come out empty,
 * which is exactly what we want to detect for the vision routing decision.
 *
 * Phase 1 calls this only for the inventory preview (~first 4000 chars).
 * Phase 2 reuses it for the full pipeline run.
 */
import { readFile } from 'node:fs/promises';

import type { ExtractedFile } from '../types';

const PREVIEW_CHAR_LIMIT = 4000;
const MIN_TEXT_PER_PAGE_FOR_USABLE = 200;

interface PdfParseResult {
  numpages: number;
  text: string;
}

/**
 * Lazy-load pdf-parse so the inventory CLI can run even when the package
 * hasn't been installed yet. Phase 1 ships before pnpm install completes
 * in some environments; the CLI degrades to filename-only classification
 * rather than crashing.
 *
 * Why we import the deep `lib/pdf-parse.js` path: the package's main
 * `index.js` has a debug branch (`isDebugMode = !module.parent`) that
 * tries to read a bundled test PDF on module load when imported outside
 * a require() context. In ESM (tsx/Node 20+) `module.parent` is unset,
 * the branch fires, and the test PDF path is wrong relative to our cwd
 * → the import throws. Importing the implementation file skips the
 * branch entirely.
 */
async function loadPdfParse(): Promise<((buffer: Buffer) => Promise<PdfParseResult>) | null> {
  try {
    const mod = (await import('pdf-parse/lib/pdf-parse.js')) as
      | { default?: (buffer: Buffer) => Promise<PdfParseResult> }
      | ((buffer: Buffer) => Promise<PdfParseResult>);
    if (typeof mod === 'function') return mod;
    if (typeof mod.default === 'function') return mod.default;
    return null;
  } catch {
    return null;
  }
}

export async function extractPdf(args: {
  sourcePath: string;
  relativePath: string;
  sizeBytes: number;
}): Promise<ExtractedFile> {
  const { sourcePath, relativePath, sizeBytes } = args;
  const base: ExtractedFile = {
    sourcePath,
    relativePath,
    sizeBytes,
    kind: 'pdf',
    preview: '',
    hasUsableText: false,
    pageCount: 0,
  };

  const pdfParse = await loadPdfParse();
  if (!pdfParse) {
    return {
      ...base,
      extractionError:
        'pdf-parse not installed — run `pnpm --filter @examready/web add pdf-parse` to enable text extraction.',
    };
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(sourcePath);
  } catch (err) {
    return { ...base, extractionError: `read failed: ${(err as Error).message}` };
  }

  let parsed: PdfParseResult;
  try {
    parsed = await pdfParse(buffer);
  } catch (err) {
    return { ...base, extractionError: `pdf-parse failed: ${(err as Error).message}` };
  }

  const pageCount = parsed.numpages || 0;
  const text = (parsed.text || '').replace(/\s+/g, ' ').trim();
  const preview = text.slice(0, PREVIEW_CHAR_LIMIT);

  // Heuristic for "scanned PDF" — if there are pages but average text per
  // page is below the threshold, the document is mostly images. The vision
  // pipeline (Phase 2) will reroute these.
  const hasUsableText =
    text.length > 0 && (pageCount === 0 || text.length / pageCount >= MIN_TEXT_PER_PAGE_FOR_USABLE);

  return {
    ...base,
    preview,
    hasUsableText,
    pageCount,
  };
}
