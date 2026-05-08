/**
 * Ambient declaration for `pdf-parse/lib/pdf-parse.js`.
 *
 * The package's published @types/pdf-parse only types the top-level
 * `pdf-parse` entry point. We import the deep `lib/pdf-parse.js` path
 * to skip the package's debug branch (see pdf.ts for the why), and that
 * deep path has no shipped types — so we declare it here matching the
 * shape we actually use.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    numpages: number;
    text: string;
  }
  function pdfParse(buffer: Buffer): Promise<PdfParseResult>;
  export = pdfParse;
}
