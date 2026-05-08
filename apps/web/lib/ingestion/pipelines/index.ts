/**
 * Pipeline registry — looks up the right pipeline for a classified file.
 *
 * Routing is purely a function of the classifier's chosen category:
 * the file format is already normalised by the extractors. Adding a
 * new pipeline = implement the interface, register it here, add the
 * mapping from category in lib/ingestion/types.ts.
 */
import type { MaterialCategory, PipelineName } from '../types';

import { courseCombinationsPipeline } from './course-combinations';
import { cutoffPipeline } from './cutoff';
import { questionsPipeline } from './questions';
import { referencePipeline } from './reference';
import { syllabusPipeline } from './syllabus';
import type { Pipeline } from './types';
import { universityPipeline } from './university';

export {
  questionsPipeline,
  syllabusPipeline,
  universityPipeline,
  courseCombinationsPipeline,
  cutoffPipeline,
  referencePipeline,
};
export type { Pipeline, PipelineProducedRow, PipelineResult, PipelineRunArgs } from './types';

/** Map from classifier category → concrete pipeline. */
export function pipelineForCategoryConcrete(c: MaterialCategory): Pipeline | null {
  switch (c) {
    case 'past-questions':
      return questionsPipeline;
    case 'syllabus':
      return syllabusPipeline;
    case 'university-list':
    case 'school-list':
      return universityPipeline;
    case 'course-requirements':
    case 'course-combinations':
      return courseCombinationsPipeline;
    case 'cutoff-marks':
      return cutoffPipeline;
    case 'study-notes':
    case 'exam-information':
    case 'reference-content':
      return referencePipeline;
    case 'unknown':
      return null;
  }
}

/** Map by pipeline NAME (used by the --pipeline CLI flag). */
export function pipelineByName(name: PipelineName): Pipeline | null {
  switch (name) {
    case 'questions':
      return questionsPipeline;
    case 'syllabus':
      return syllabusPipeline;
    case 'university':
      return universityPipeline;
    case 'course-combinations':
      return courseCombinationsPipeline;
    case 'cutoff':
      return cutoffPipeline;
    case 'reference':
      return referencePipeline;
  }
}
