/**
 * Image extractor — Phase 1 stub. Phase 2.1 wires this to the vision
 * pipeline (DeepSeek-vl2-chat with OpenAI gpt-4o-mini fallback).
 *
 * For now we surface metadata only (dimensions if sharp is available)
 * so the inventory CLI can list and classify based on filename hints.
 */
import { stat } from 'node:fs/promises';

import type { ExtractedFile } from '../types';

export async function extractImage(args: {
  sourcePath: string;
  relativePath: string;
  sizeBytes: number;
}): Promise<ExtractedFile> {
  const { sourcePath, relativePath, sizeBytes } = args;
  const base: ExtractedFile = {
    sourcePath,
    relativePath,
    sizeBytes,
    kind: 'image',
    preview: '',
    hasUsableText: false,
    pageCount: 0,
  };

  // Just confirm the file is readable. Vision-based text extraction lives
  // in Phase 2 — for inventory we only need to know the file exists.
  try {
    await stat(sourcePath);
    return {
      ...base,
      preview: '[image — vision extraction queued for Phase 2]',
      hasUsableText: false,
    };
  } catch (err) {
    return { ...base, extractionError: `stat failed: ${(err as Error).message}` };
  }
}
