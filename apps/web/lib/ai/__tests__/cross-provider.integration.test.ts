/**
 * Cross-provider integration tests.
 *
 * SKIPS unless BOTH ANTHROPIC_API_KEY and DEEPSEEK_API_KEY are set.
 *
 * These don't assert content equivalence (impossible — the models phrase
 * things differently, that's expected). They assert SHAPE equivalence:
 * the abstraction we built means the same prompt to either provider
 * comes back as the same structured shape, so call sites work without
 * caring which provider answered.
 *
 * Three tests, each ~$0.001-$0.01:
 *  1. completion(): both providers return non-empty text + token counts
 *  2. toolUse(): both validate against the same Zod schema
 *  3. stream(): both yield text + usage chunks
 */
import { describe, expect, test } from 'vitest';

import { studyPlanSchema, STUDY_PLAN_TOOL } from '../prompts/study-plan';
import { anthropicProvider } from '../providers/anthropic';
import { deepseekProvider } from '../providers/deepseek';

const both = !!process.env.ANTHROPIC_API_KEY && !!process.env.DEEPSEEK_API_KEY;
const itOrSkip = both ? test : test.skip;

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const DEEPSEEK_MODEL = 'deepseek-chat';

const TIMEOUT_MS = 90_000;

describe('cross-provider shape equivalence', () => {
  itOrSkip(
    'completion: both providers return { text, inputTokens, outputTokens }',
    async () => {
      const params = {
        maxTokens: 64,
        systemPrompt: 'Reply in one short sentence. No preamble.',
        messages: [
          { role: 'user' as const, content: 'What is 2 + 2? Reply with just the number.' },
        ],
      };

      const [anthropicResult, deepseekResult] = await Promise.all([
        anthropicProvider.completion({ ...params, model: ANTHROPIC_MODEL }),
        deepseekProvider.completion({ ...params, model: DEEPSEEK_MODEL }),
      ]);

      for (const r of [anthropicResult, deepseekResult]) {
        expect(typeof r.text).toBe('string');
        expect(r.text.length).toBeGreaterThan(0);
        expect(typeof r.inputTokens).toBe('number');
        expect(typeof r.outputTokens).toBe('number');
        expect(r.inputTokens).toBeGreaterThan(0);
        expect(r.outputTokens).toBeGreaterThan(0);
      }

      // Sanity check on content — both should mention "4" somewhere.
      expect(anthropicResult.text).toMatch(/4/);
      expect(deepseekResult.text).toMatch(/4/);
    },
    TIMEOUT_MS,
  );

  itOrSkip(
    'toolUse: both validate against the same Zod schema',
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const examDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const params = {
        maxTokens: 4096,
        systemPrompt: 'You generate small structured study plans. Output via the tool only.',
        messages: [
          {
            role: 'user' as const,
            content: `Today is ${today}. Exam date: ${examDate}. Hours per week: 6. Weak topics: algebra (35%). Generate a 3-week plan via the output_study_plan tool.`,
          },
        ],
        tool: STUDY_PLAN_TOOL,
      };

      const [anthropicResult, deepseekResult] = await Promise.all([
        anthropicProvider.toolUse({ ...params, model: ANTHROPIC_MODEL }),
        deepseekProvider.toolUse({ ...params, model: DEEPSEEK_MODEL }),
      ]);

      for (const r of [anthropicResult, deepseekResult]) {
        expect(r.toolName).toBe('output_study_plan');
        const v = studyPlanSchema.safeParse(r.input);
        if (!v.success) {
          // eslint-disable-next-line no-console
          console.warn(`[cross-provider toolUse] zod failure on ${r.toolName}:`, v.error.flatten());
        }
        expect(v.success).toBe(true);
      }
    },
    TIMEOUT_MS,
  );

  itOrSkip(
    'stream: both yield interleaved text + usage chunks',
    async () => {
      const params = {
        maxTokens: 64,
        systemPrompt: 'Reply briefly.',
        messages: [{ role: 'user' as const, content: 'Count from 1 to 5.' }],
      };

      const collect = async (
        iter: AsyncIterable<
          | { kind: 'text'; text: string }
          | { kind: 'usage'; inputTokens?: number; outputTokens?: number }
        >,
      ) => {
        const text: string[] = [];
        let sawUsage = false;
        for await (const chunk of iter) {
          if (chunk.kind === 'text') text.push(chunk.text);
          if (chunk.kind === 'usage') sawUsage = true;
        }
        return { joined: text.join(''), sawUsage };
      };

      const [a, d] = await Promise.all([
        collect(anthropicProvider.stream({ ...params, model: ANTHROPIC_MODEL })),
        collect(deepseekProvider.stream({ ...params, model: DEEPSEEK_MODEL })),
      ]);

      expect(a.joined.length).toBeGreaterThan(0);
      expect(d.joined.length).toBeGreaterThan(0);
      expect(a.sawUsage).toBe(true);
      expect(d.sawUsage).toBe(true);
    },
    TIMEOUT_MS,
  );
});
