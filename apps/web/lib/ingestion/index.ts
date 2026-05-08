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
  PIPELINE_NAMES,
  pipelineForCategory,
  pipelineRuntimeName,
  type ClassificationResult,
  type ExtractedFile,
  type FileKind,
  type IngestionPipeline,
  type InventoryEntry,
  type MaterialCategory,
  type PipelineName,
} from './types';
export { auditItem, type AuditVerdict } from './audit';
export { batchEnrich, enrichItem, type EnrichmentResult } from './enricher';
export { estimateCost, formatCostUsd, priceFor } from './cost';
export {
  pipelineForCategoryConcrete,
  pipelineByName,
  questionsPipeline,
  syllabusPipeline,
  universityPipeline,
  courseCombinationsPipeline,
  cutoffPipeline,
  referencePipeline,
  type Pipeline,
  type PipelineProducedRow,
  type PipelineResult,
  type PipelineRunArgs,
} from './pipelines';
