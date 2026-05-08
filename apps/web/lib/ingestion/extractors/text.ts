/**
 * Text-family extractor — handles .txt / .csv / .json / .md / .html.
 *
 * For HTML we strip tags via cheerio so the preview is meaningful for
 * classification. For everything else we read raw and let the classifier
 * see the structure.
 */
import { readFile } from 'node:fs/promises';

import type { ExtractedFile, FileKind } from '../types';

const PREVIEW_CHAR_LIMIT = 4000;

async function stripHtml(html: string): Promise<string> {
  try {
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  } catch {
    // cheerio missing → fall back to a crude tag strip. Good enough for preview.
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export async function extractText(args: {
  sourcePath: string;
  relativePath: string;
  sizeBytes: number;
  kind: Extract<FileKind, 'text' | 'csv' | 'json' | 'html'>;
}): Promise<ExtractedFile> {
  const { sourcePath, relativePath, sizeBytes, kind } = args;
  const base: ExtractedFile = {
    sourcePath,
    relativePath,
    sizeBytes,
    kind,
    preview: '',
    hasUsableText: false,
    pageCount: 0,
  };

  let raw: string;
  try {
    raw = await readFile(sourcePath, 'utf8');
  } catch (err) {
    return { ...base, extractionError: `read failed: ${(err as Error).message}` };
  }

  const text = kind === 'html' ? await stripHtml(raw) : raw.replace(/\s+/g, ' ').trim();
  return {
    ...base,
    preview: text.slice(0, PREVIEW_CHAR_LIMIT),
    hasUsableText: text.length > 20,
    pageCount: 0,
  };
}
