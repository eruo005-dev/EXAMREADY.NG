/**
 * Extractor router — picks the right extractor based on file extension.
 *
 * Adding a new format: implement a new extractor that returns ExtractedFile
 * and wire it into `kindFromExt` + the switch in `extract`.
 */
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';

import type { ExtractedFile, FileKind } from '../types';

import { extractDocx } from './docx';
import { extractImage } from './image';
import { extractPdf } from './pdf';
import { extractText } from './text';

export { extractPdf, extractDocx, extractText, extractImage };

export function kindFromExt(filePath: string): FileKind {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'pdf';
    case '.docx':
    case '.doc':
      return 'docx';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.webp':
    case '.gif':
    case '.bmp':
    case '.tiff':
      return 'image';
    case '.csv':
    case '.tsv':
      return 'csv';
    case '.json':
    case '.jsonl':
      return 'json';
    case '.html':
    case '.htm':
      return 'html';
    case '.txt':
    case '.md':
    case '.markdown':
    case '.rtf':
      return 'text';
    default:
      return 'unknown';
  }
}

/**
 * Top-level extract — dispatches by detected kind. The router caller
 * passes the relative path (relative to materials/) so callers can use
 * it as a stable key in the inventory report.
 */
export async function extract(args: {
  sourcePath: string;
  relativePath: string;
}): Promise<ExtractedFile> {
  const { sourcePath, relativePath } = args;
  const stats = await stat(sourcePath);
  const sizeBytes = stats.size;
  const kind = kindFromExt(sourcePath);
  const common = { sourcePath, relativePath, sizeBytes };

  switch (kind) {
    case 'pdf':
      return extractPdf(common);
    case 'docx':
      return extractDocx(common);
    case 'image':
      return extractImage(common);
    case 'csv':
    case 'json':
    case 'html':
    case 'text':
      return extractText({ ...common, kind });
    case 'unknown':
      return {
        ...common,
        kind: 'unknown',
        preview: '',
        hasUsableText: false,
        pageCount: 0,
        extractionError: `unsupported extension: ${extname(sourcePath)}`,
      };
  }
}
