/**
 * Enrichment pass — fills in fields the parser couldn't extract from the
 * raw source.
 *
 * Per pipeline:
 *   - questions: topic_id match, difficulty, explanation, worked solution,
 *                common-mistake note, frequency score
 *   - syllabus topic: 1-2 sentence description
 *   - university: paragraph description, faculty list, notable programmes
 *   - course: career paths, brief description
 *   - cutoff: nothing to enrich (numbers are numbers)
 *
 * Batched at 5 items per call where possible to amortise the system-prompt
 * tokens against multiple outputs and lift the prompt-cache hit ratio
 * (the system prompt is identical across batched items).
 *
 * Provenance contract: every enriched row writes
 * `enriched_by_model` + `enriched_at` so a reviewer can answer
 * "which prompt version produced this?" weeks later.
 */
import { getProvider } from '../ai/providers';

import { estimateCost } from './cost';
import type { PipelineName } from './types';

export interface EnrichmentResult<T> {
  enriched: T;
  /** USD cost for this item (per-item if batched, the call cost / batch size). */
  costUsd: number;
  model: string;
}

interface BatchInputItem<T> {
  /** Stable key the caller uses to match input to output (e.g. question.id). */
  key: string;
  /** The raw row that needs enrichment. */
  raw: T;
}

interface BatchEnrichArgs<T, E> {
  pipeline: PipelineName;
  items: BatchInputItem<T>[];
  /** System prompt — built by the pipeline-specific enricher. */
  systemPrompt: string;
  /** How to render each item into its user-message segment. */
  renderItem: (item: T, index: number) => string;
  /** How to parse a single output JSON block back into the enriched type. */
  parseItem: (json: unknown) => E | null;
}

/**
 * Generic batched enricher — accepts up to 5 items, returns a map keyed
 * by the caller's `key` so callers don't have to reason about ordering.
 *
 * Returns null entries for items DeepSeek dropped or failed to enrich;
 * the caller decides whether to retry singly or mark the row as
 * needing manual completion.
 */
export async function batchEnrich<TRaw, TEnriched>(
  args: BatchEnrichArgs<TRaw, TEnriched>,
): Promise<Map<string, EnrichmentResult<TEnriched> | null>> {
  const out = new Map<string, EnrichmentResult<TEnriched> | null>();
  if (args.items.length === 0) return out;

  const ds = getProvider('deepseek');
  if (!ds.isConfigured()) {
    for (const item of args.items) out.set(item.key, null);
    return out;
  }

  const userPrompt = [
    `You will be given ${args.items.length} ${args.pipeline} items in JSON.`,
    'Return a JSON array of enriched objects in the SAME ORDER. Use the same item keys you received.',
    '',
    'Items:',
    '[',
    ...args.items.map((it, i) => `  // item key=${it.key}\n  ${args.renderItem(it.raw, i)},`),
    ']',
  ].join('\n');

  let response: Awaited<ReturnType<typeof ds.completion>>;
  try {
    response = await ds.completion({
      model: 'deepseek-chat',
      systemPrompt: args.systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.4,
      maxTokens: 2200,
    });
  } catch {
    for (const item of args.items) out.set(item.key, null);
    return out;
  }

  // Parse the array response.
  let array: unknown[];
  try {
    const text = response.text.trim();
    const cleaned = text.startsWith('```') ? text.replace(/```(?:json)?|```/g, '').trim() : text;
    const parsed = JSON.parse(cleaned);
    array = Array.isArray(parsed) ? parsed : [];
  } catch {
    for (const item of args.items) out.set(item.key, null);
    return out;
  }

  // High prompt-cache hit ratio for batched calls — the system prompt is
  // unchanged across the run, and the user prompt's prefix (the rendered
  // schema) repeats too. Calibrated estimate at 0.6.
  const totalCost = estimateCost({
    model: 'deepseek-chat',
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    cacheHitRatio: 0.6,
  });
  const perItemCost = totalCost / Math.max(1, args.items.length);

  for (let i = 0; i < args.items.length; i++) {
    const key = args.items[i]!.key;
    const slot = array[i];
    const enriched = slot ? args.parseItem(slot) : null;
    out.set(key, enriched ? { enriched, costUsd: perItemCost, model: 'deepseek-chat' } : null);
  }
  return out;
}

/**
 * Single-item enrichment — used when batching is awkward (e.g. very long
 * source text, or first-pass debug). Same interface as batchEnrich for
 * consistency. Implemented via batchEnrich with a 1-item array.
 */
export async function enrichItem<TRaw, TEnriched>(args: {
  pipeline: PipelineName;
  systemPrompt: string;
  raw: TRaw;
  render: (raw: TRaw) => string;
  parse: (json: unknown) => TEnriched | null;
}): Promise<EnrichmentResult<TEnriched> | null> {
  const map = await batchEnrich<TRaw, TEnriched>({
    pipeline: args.pipeline,
    systemPrompt: args.systemPrompt,
    items: [{ key: 'one', raw: args.raw }],
    renderItem: args.render,
    parseItem: args.parse,
  });
  return map.get('one') ?? null;
}
