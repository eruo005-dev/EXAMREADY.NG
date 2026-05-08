/**
 * Editorial factory ingestion barrel.
 *
 * Surface kept narrow on purpose — internal modules import deep paths
 * (extractors/pdf etc.) but everything that crosses a feature boundary
 * (CLI, admin API routes, queue workers) imports from here so refactors
 * inside the folder don't ripple.
 */
export {
  extract,
  extractPdf,
  extractDocx,
  extractText,
  extractImage,
  kindFromExt,
} from './extractors';
export { classifyHeuristic, classifyWithDeepSeek } from './classify';
export {
  MATERIAL_CATEGORIES,
  INGESTION_PIPELINES,
  pipelineForCategory,
  type ClassificationResult,
  type ExtractedFile,
  type FileKind,
  type IngestionPipeline,
  type InventoryEntry,
  type MaterialCategory,
} from './types';
