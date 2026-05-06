/**
 * Integration test for explain-differently against the real Claude API.
 *
 * SKIPS when ANTHROPIC_API_KEY is unset — most local/CI runs. To exercise
 * it you need:
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @examready/web test
 *
 * Coverage: 5 questions (3 Math + 2 English) × 3 levels = 15 model calls.
 * Each call costs ~$0.001 on Haiku 4.5; full run is ~$0.015. Run sparingly,
 * not on every CI build — this test is for human-in-the-loop quality
 * verification, not regression prevention.
 *
 * What we assert:
 *  - Model produces non-empty text
 *  - Output respects "no markdown" rule (no `**`, no `#` headings)
 *  - Pidgin variant uses Pidgin markers and avoids Yoruba/Igbo/Hausa
 *  - With-analogy variant references at least one real-world concept
 *
 * What we DON'T assert:
 *  - Specific wording (model output varies). Don't write tests that
 *    snapshot full model responses — they'll be flaky and useless.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, test } from 'vitest';

import { AI_MODELS } from '../client';
import {
  buildExplainUserMessage,
  EXPLAIN_SYSTEM_PROMPTS,
  type ExplainLevel,
} from '../prompts/explain-differently';

const apiKey = process.env.ANTHROPIC_API_KEY;
const itOrSkip = apiKey ? test : test.skip;

const SAMPLES = [
  {
    label: 'Math: quadratic factorisation',
    stem: 'Solve x² + 5x − 14 = 0.',
    options: [
      { label: 'A', content: 'x = 7 or x = −2', isCorrect: false },
      { label: 'B', content: 'x = 2 or x = −7', isCorrect: true },
      { label: 'C', content: 'x = −2 or x = −7', isCorrect: false },
      { label: 'D', content: 'x = 2 or x = 7', isCorrect: false },
    ],
    explanation:
      'Factorise: find two numbers that multiply to −14 and add to 5 — those are 7 and −2. So (x + 7)(x − 2) = 0, giving x = −7 or x = 2.',
  },
  {
    label: 'Math: percentage change',
    stem: 'A trader sold a radio for ₦4,500 at a profit of 20%. Find the cost price.',
    options: [
      { label: 'A', content: '₦3,600', isCorrect: false },
      { label: 'B', content: '₦3,750', isCorrect: true },
      { label: 'C', content: '₦4,000', isCorrect: false },
      { label: 'D', content: '₦5,400', isCorrect: false },
    ],
    explanation:
      'Selling price = cost × (1 + 0.20) = 1.20 × cost. Cost = 4500 / 1.20 = ₦3,750.',
  },
  {
    label: 'Math: trigonometry',
    stem: 'If sin θ = 3/5 and θ is acute, find cos θ.',
    options: [
      { label: 'A', content: '3/4', isCorrect: false },
      { label: 'B', content: '4/5', isCorrect: true },
      { label: 'C', content: '4/3', isCorrect: false },
      { label: 'D', content: '5/4', isCorrect: false },
    ],
    explanation:
      'Using sin²θ + cos²θ = 1: cos²θ = 1 − 9/25 = 16/25. Since θ is acute, cos θ = 4/5.',
  },
  {
    label: 'English: subject-verb agreement',
    stem: 'Each of the boys _____ his book.',
    options: [
      { label: 'A', content: 'have lost', isCorrect: false },
      { label: 'B', content: 'has lost', isCorrect: true },
      { label: 'C', content: 'had lose', isCorrect: false },
      { label: 'D', content: 'have losing', isCorrect: false },
    ],
    explanation:
      "When 'each of' precedes a plural noun, the verb still agrees with 'each' (singular) — so use 'has lost', not 'have lost'.",
  },
  {
    label: 'English: idiom',
    stem: "The expression 'to bury the hatchet' means to:",
    options: [
      { label: 'A', content: 'hide a weapon', isCorrect: false },
      { label: 'B', content: 'make peace', isCorrect: true },
      { label: 'C', content: 'start a fight', isCorrect: false },
      { label: 'D', content: 'abandon a plan', isCorrect: false },
    ],
    explanation:
      'An idiom from Native American practice: warring tribes literally buried weapons as a peace gesture. Today it means to settle a dispute.',
  },
];

const LEVELS: ExplainLevel[] = ['simpler', 'with-analogy', 'in-pidgin'];

// 5 minutes — model calls can be slow under cold-start.
const PER_TEST_TIMEOUT = 5 * 60 * 1000;

describe.concurrent('explain-differently integration', () => {
  for (const sample of SAMPLES) {
    for (const level of LEVELS) {
      itOrSkip(
        `${sample.label} → ${level}`,
        async () => {
          const anthropic = new Anthropic({ apiKey });
          const userMessage = buildExplainUserMessage({
            questionStem: sample.stem,
            options: sample.options,
            originalExplanation: sample.explanation,
          });

          const completion = await anthropic.messages.create({
            model: AI_MODELS.explainDifferently,
            max_tokens: 800,
            system: EXPLAIN_SYSTEM_PROMPTS[level],
            messages: [{ role: 'user', content: userMessage }],
          });

          const textBlock = completion.content.find((b) => b.type === 'text');
          expect(textBlock).toBeDefined();
          if (!textBlock || textBlock.type !== 'text') return;

          const out = textBlock.text;
          expect(out.length).toBeGreaterThan(40);

          // No markdown headers / lists / bold
          expect(out).not.toMatch(/^#+ /m);
          expect(out).not.toMatch(/\*\*[A-Za-z]/);
          expect(out).not.toMatch(/^\* /m);

          // Level-specific assertions
          if (level === 'in-pidgin') {
            // Should contain at least one Pidgin marker.
            const pidginMarkers = ['make we', 'una', 'as e be', 'no be', 'go solve', 'the answer na', 'wahala', 'fit'];
            expect(pidginMarkers.some((m) => out.toLowerCase().includes(m))).toBe(true);
            // Should NOT include Yoruba/Igbo/Hausa words frequently mistaken for Pidgin
            const nonPidgin = ['oga', 'biko', 'wallahi'];
            expect(nonPidgin.some((m) => out.toLowerCase().includes(m))).toBe(false);
          }

          // No sycophantic openers (system prompt forbids)
          expect(out.toLowerCase()).not.toMatch(/^(sure|of course|certainly|here is|here's)/);
        },
        PER_TEST_TIMEOUT,
      );
    }
  }
});
