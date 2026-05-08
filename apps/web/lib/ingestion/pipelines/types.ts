/**
 * Shared pipeline types.
 *
 * Each pipeline implements the `Pipeline<Output>` interface and returns
 * structured rows + audit verdicts. The CLI/admin runner consumes these
 * uniformly — a new pipeline only needs to implement the interface
 * (no special-casing in the runner).
 */
import type { ExtractedFile, PipelineName } from '../types';
import type { AuditVerdict } from '../audit';

export interface PipelineRunArgs {
  /** The extractor's output. */
  file: ExtractedFile;
  /** When true, the pipeline parses + enriches but does NOT write to the DB. */
  dryRun?: boolean;
}

export interface PipelineProducedRow<T> {
  /** The structured row that lands in the target table. */
  row: T;
  /** Stable key for re-association on retry (e.g. row.id once inserted, or a temp UUID). */
  key: string;
  /** Audit verdict — null if audit didn't run (rare; missing API key). */
  audit: AuditVerdict | null;
  /** Estimated USD cost for this single item (enrich + audit). */
  costUsd: number;
}

export interface PipelineResult<T> {
  pipeline: PipelineName;
  /** All rows produced. The caller writes them to the DB transactionally. */
  produced: PipelineProducedRow<T>[];
  /** Free-form notes — failure modes, skipped sections, things to flag. */
  notes: string[];
}

export interface Pipeline<T = unknown> {
  readonly name: PipelineName;
  /** Whether this pipeline can consume the given file (e.g. by kind/category). */
  accepts(file: ExtractedFile): boolean;
  run(args: PipelineRunArgs): Promise<PipelineResult<T>>;
}
