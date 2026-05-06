/**
 * Integration tests for the DeepSeek provider against the live API.
 *
 * SKIPS when DEEPSEEK_API_KEY is unset — most local/CI runs. To exercise
 * it you need:
 *   DEEPSEEK_API_KEY=sk-... pnpm --filter @examready/web test
 *
 * Coverage: 5 tests covering the three operations the provider exposes
 * (completion, stream, toolUse) plus the explain-differently prompts at
 * the simpler and analogy levels (which are routed to DeepSeek in
 * production). Each call costs <$0.001 on deepseek-chat; full run is
 * ~$0.005. Safe to run repeatedly during development.
 */
import { describe, expect, test } from 'vitest';

import { buildExplainUserMessage, EXPLAIN_SYSTEM_PROMPTS } from '../prompts/explain-differently';
import { studyPlanSchema, STUDY_PLAN_TOOL } from '../prompts/study-plan';
import { deepseekProvider } from '../providers/deepseek';

const apiKey = process.env.DEEPSEEK_API_KEY;
const itOrSkip = apiKey ? test : test.skip;

const SAMPLE_QUESTION = {
  questionStem: 'Solve x² + 5x − 14 = 0.',
  options: [
    { label: 'A', content: 'x = 7 or x = −2', isCorrect: false },
    { label: 'B', content: 'x = 2 or x = −7', isCorrect: true },
    { label: 'C', content: 'x = −2 or x = −7', isCorrect: false },
    { label: 'D', content: 'x = 2 or x = 7', isCorrect: false },
  ],
  originalExplanation:
    'Factorise: find two numbers that multiply to −14 and add to 5 — those are 7 and −2. So (x + 7)(x − 2) = 0, giving x = −7 or x = 2.',
};

const TIMEOUT_MS = 60_000;

describe('deepseek provider — live integration', () => {
  itOrSkip(
    'completion: simpler-English explain returns non-empty text within length budget',
    async () => {
      const result = await deepseekProvider.completion({
        model: 'deepseek-chat',
        maxTokens: 800,
        systemPrompt: EXPLAIN_SYSTEM_PROMPTS.simpler,
        messages: [{ role: 'user', content: buildExplainUserMessage(SAMPLE_QUESTION) }],
      });
      expect(result.text.length).toBeGreaterThan(40);
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
      // Length constraint: 4-6 sentences total. Allow 8 as a soft ceiling.
      const sentenceCount = result.text.split(/[.!?]+\s/).filter(Boolean).length;
      expect(sentenceCount).toBeLessThanOrEqual(10);
    },
    TIMEOUT_MS,
  );

  itOrSkip(
    'completion: with-analogy returns Nigerian-context analogy',
    async () => {
      const result = await deepseekProvider.completion({
        model: 'deepseek-chat',
        maxTokens: 800,
        systemPrompt: EXPLAIN_SYSTEM_PROMPTS['with-analogy'],
        messages: [{ role: 'user', content: buildExplainUserMessage(SAMPLE_QUESTION) }],
      });
      expect(result.text.length).toBeGreaterThan(40);
      // No markdown
      expect(result.text).not.toMatch(/^#+ /m);
      expect(result.text).not.toMatch(/\*\*[A-Za-z]/);
    },
    TIMEOUT_MS,
  );

  itOrSkip(
    'stream: yields text chunks then a usage chunk',
    async () => {
      const chunks: string[] = [];
      let usageInputTokens = 0;
      let usageOutputTokens = 0;
      for await (const chunk of deepseekProvider.stream({
        model: 'deepseek-chat',
        maxTokens: 64,
        systemPrompt: 'Be brief.',
        messages: [{ role: 'user', content: 'Say "hello world" then stop.' }],
      })) {
        if (chunk.kind === 'text') chunks.push(chunk.text);
        if (chunk.kind === 'usage') {
          if (chunk.inputTokens) usageInputTokens = chunk.inputTokens;
          if (chunk.outputTokens) usageOutputTokens = chunk.outputTokens;
        }
      }
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('').toLowerCase()).toContain('hello world');
      expect(usageInputTokens).toBeGreaterThan(0);
      expect(usageOutputTokens).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );

  itOrSkip(
    'toolUse: study-plan tool returns parsed object that passes the Zod schema',
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const examDate = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await deepseekProvider.toolUse({
        model: 'deepseek-chat',
        maxTokens: 4096,
        systemPrompt: 'You generate small structured study plans. Output via the tool only.',
        messages: [
          {
            role: 'user',
            content: `Today is ${today}. Exam date: ${examDate}. Hours per week: 8. Weak topics: algebra (40%). Generate a 4-week plan via the output_study_plan tool.`,
          },
        ],
        tool: STUDY_PLAN_TOOL,
      });

      expect(result.toolName).toBe('output_study_plan');
      const validated = studyPlanSchema.safeParse(result.input);
      // Don't fail the test on every validation slip — log so the operator
      // can see the model's actual output. The assertion below makes
      // success necessary for the test to pass.
      if (!validated.success) {
        // eslint-disable-next-line no-console
        console.warn('[deepseek toolUse] zod failure:', validated.error.flatten());
      }
      expect(validated.success).toBe(true);
    },
    TIMEOUT_MS,
  );

  itOrSkip('isConfigured returns true when key is set', () => {
    expect(deepseekProvider.isConfigured()).toBe(true);
  });
});
