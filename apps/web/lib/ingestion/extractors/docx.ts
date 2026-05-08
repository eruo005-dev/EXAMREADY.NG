/**
 * DOCX text extractor — uses mammoth to convert to plain text/markdown.
 *
 * mammoth handles the modern Office Open XML format. .doc (the legacy
 * binary format from pre-2007 Word) is NOT supported and will fail —
 * those files need to be re-saved as .docx first. The error message
 * surfaces this clearly.
 */
import { readFile } from 'node:fs/promises';

import type { ExtractedFile } from '../types';

const PREVIEW_CHAR_LIMIT = 4000;

export async function extractDocx(args: {
  sourcePath: string;
  relativePath: string;
  sizeBytes: number;
}): Promise<ExtractedFile> {
  const { sourcePath, relativePath, sizeBytes } = args;
  const base: ExtractedFile = {
    sourcePath,
    relativePath,
    sizeBytes,
    kind: 'docx',
    preview: '',
    hasUsableText: false,
    pageCount: 0,
  };

  let mammoth: typeof import('mammoth');
  try {
    mammoth = await import('mammoth');
  } catch {
    return {
      ...base,
      extractionError: 'mammoth not installed — run `pnpm --filter @examready/web add mammoth`.',
    };
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(sourcePath);
  } catch (err) {
    return { ...base, extractionError: `read failed: ${(err as Error).message}` };
  }

  try {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.replace(/\s+/g, ' ').trim();
    return {
      ...base,
      preview: text.slice(0, PREVIEW_CHAR_LIMIT),
      hasUsableText: text.length > 50,
      // mammoth doesn't expose page count cheaply; leave 0.
      pageCount: 0,
    };
  } catch (err) {
    return {
      ...base,
      extractionError: `mammoth failed: ${(err as Error).message} (legacy .doc format? Re-save as .docx.)`,
    };
  }
}
