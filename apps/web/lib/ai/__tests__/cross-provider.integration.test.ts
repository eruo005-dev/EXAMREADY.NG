/**
 * Cross-provider shape-equivalence tests.
 *
 * DISABLED at Sprint 6.
 *
 * Sprint 5 used a hybrid Anthropic + DeepSeek strategy, and these tests
 * verified that both adapters produced the same shape for the same
 * prompt. Sprint 6 retired Anthropic as an active provider — DeepSeek
 * is now primary for everything, with OpenAI gpt-4o-mini as the
 * emergency fallback. With only one active "primary class" provider,
 * shape-equivalence has nothing to compare against.
 *
 * If a future sprint re-enables Anthropic (or adds another primary
 * provider), uncomment the implementation below and update the imports.
 *
 * For OpenAI fallback shape verification, see openai.integration.test.ts
 * (added in Sprint 6) — it asserts that the gpt-4o-mini output passes
 * the same Zod schema as DeepSeek for the structured-output tools.
 */
import { describe, test } from 'vitest';

describe.skip('cross-provider shape equivalence (Sprint 6: only DeepSeek active)', () => {
  test('placeholder', () => {
    // Suite is intentionally empty until a second active primary provider exists.
  });
});

/* === Original Sprint 5 cross-provider tests — disabled at Sprint 6 ===

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
      // ... same body as Sprint 5 ...
    },
    TIMEOUT_MS,
  );
  // ... rest of Sprint 5 suite ...
});

=== end disabled cross-provider suite === */
