/**
 * Pure-JS tests for prompt construction. No API key needed.
 *
 * These lock in the structure of what we send to Claude — if a future
 * refactor accidentally drops the "CORRECT" marker on the right option,
 * or stops including past mistakes in the tutor context, these tests
 * fail and tell us what changed.
 */
import { describe, expect, test } from 'vitest';

import {
  buildExplainUserMessage,
  EXPLAIN_SYSTEM_PROMPTS,
} from '../prompts/explain-differently';
import { buildGenerateQuestionsUserMessage } from '../prompts/generate-questions';
import { buildStudyPlanUserMessage } from '../prompts/study-plan';
import { buildTutorContextMessage, TUTOR_SYSTEM_PROMPT } from '../prompts/tutor';

describe('explain-differently prompts', () => {
  test('all three system prompts share the same forbidding-rules block', () => {
    // Constraint: every variant must include "Do not change the correct answer"
    // since the model rewrites, not re-derives.
    for (const level of ['simpler', 'with-analogy', 'in-pidgin'] as const) {
      expect(EXPLAIN_SYSTEM_PROMPTS[level]).toContain('Do not change the correct answer');
      expect(EXPLAIN_SYSTEM_PROMPTS[level]).toContain('PLAIN TEXT only');
    }
  });

  test('pidgin prompt explicitly forbids non-Pidgin language slipping in', () => {
    // The Pidgin variant is the moat — make sure the prompt is explicit
    // about the failure modes (Jamaican Patois, Yoruba/Igbo/Hausa words).
    const pidgin = EXPLAIN_SYSTEM_PROMPTS['in-pidgin'];
    expect(pidgin).toContain('Nigerian Pidgin');
    expect(pidgin).toMatch(/NOT Jamaican/i);
    expect(pidgin).toMatch(/Yoruba/);
    expect(pidgin).toMatch(/Igbo/);
    expect(pidgin).toMatch(/Hausa/);
    expect(pidgin).toContain('STAY in English'); // technical terms preserved
  });

  test('pidgin prompt names the register with concrete examples', () => {
    const pidgin = EXPLAIN_SYSTEM_PROMPTS['in-pidgin'];
    // Authentic Nigerian Pidgin markers should be present as exemplars
    expect(pidgin).toContain('make we');
    expect(pidgin).toContain('una');
    expect(pidgin).toContain('the answer na');
  });

  test('user message marks the correct option and includes the original explanation', () => {
    const msg = buildExplainUserMessage({
      questionStem: 'Solve x² − 9 = 0',
      passage: null,
      options: [
        { label: 'A', content: 'x = 3', isCorrect: false },
        { label: 'B', content: 'x = ±3', isCorrect: true },
        { label: 'C', content: 'x = 9', isCorrect: false },
        { label: 'D', content: 'x = ±9', isCorrect: false },
      ],
      originalExplanation: 'Difference of two squares: (x-3)(x+3)=0 → x=±3.',
    });
    expect(msg).toContain('B. x = ±3   [CORRECT]');
    expect(msg).toContain('CORRECT ANSWER: B');
    expect(msg).toContain('Difference of two squares');
    // The user-message tail tells the model NOT to use a "Here is..." preamble.
    expect(msg).toMatch(/no "Here is\.\.\."/);
  });

  test('user message includes passage block when provided', () => {
    const msg = buildExplainUserMessage({
      questionStem: 'What is the main idea?',
      passage: 'The harmattan is a dry wind…',
      options: [
        { label: 'A', content: 'Climate', isCorrect: true },
        { label: 'B', content: 'Politics', isCorrect: false },
      ],
      originalExplanation: 'Test',
    });
    expect(msg).toContain('PASSAGE:');
    expect(msg).toContain('harmattan');
  });
});

describe('tutor prompt', () => {
  test('system prompt sets the Nigerian-context anchor', () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain('Nigerian students');
    expect(TUTOR_SYSTEM_PROMPT).toContain('JAMB');
    expect(TUTOR_SYSTEM_PROMPT).toContain('WAEC');
  });

  test('system prompt forbids markdown headings and asterisks', () => {
    expect(TUTOR_SYSTEM_PROMPT).toMatch(/markdown headings/i);
    expect(TUTOR_SYSTEM_PROMPT).toContain('asterisks');
  });

  test('system prompt includes the mental-health helpline', () => {
    // Specifically the MANI helpline. We don't want this number to drift
    // accidentally in a refactor — that would matter for real students.
    expect(TUTOR_SYSTEM_PROMPT).toContain('+234 809 210 6493');
  });

  test('context message is empty when no question and no mistakes', () => {
    expect(buildTutorContextMessage({})).toBe('');
  });

  test('context message includes recent mistakes when supplied', () => {
    const ctx = buildTutorContextMessage({
      questionStem: 'Find dy/dx for y = sin(2x).',
      questionExplanation: 'Apply chain rule.',
      topicName: 'Calculus',
      recentMistakes: [
        { stem: 'Find dy/dx for y = cos(3x).', theirAnswer: 'A', correctAnswer: 'C', daysAgo: 2 },
        { stem: 'Find dy/dx for y = e^(2x).', theirAnswer: 'B', correctAnswer: 'D', daysAgo: 5 },
      ],
    });
    expect(ctx).toContain('Topic: Calculus');
    expect(ctx).toContain('Current question:');
    expect(ctx).toContain("Student's recent mistakes");
    expect(ctx).toContain('cos(3x)');
    expect(ctx).toContain('2d ago');
    expect(ctx).toContain('5d ago');
  });

  test('context message truncates very long stems in the mistake list', () => {
    const longStem = 'x'.repeat(200);
    const ctx = buildTutorContextMessage({
      recentMistakes: [
        { stem: longStem, theirAnswer: 'A', correctAnswer: 'B', daysAgo: 1 },
      ],
    });
    expect(ctx).toContain('xxx…'); // truncation marker
    expect(ctx.length).toBeLessThan(800); // sanity: not pasting the whole stem
  });
});

describe('study-plan prompt', () => {
  test('user message lists weak topics with accuracy percentages', () => {
    const msg = buildStudyPlanUserMessage({
      examName: 'JAMB UTME',
      examDate: '2026-04-15',
      hoursPerWeek: 10,
      weakTopics: [
        { slug: 'algebra', name: 'Algebra', accuracyPercent: 35 },
        { slug: 'comprehension', name: 'Comprehension', accuracyPercent: 42 },
      ],
      todayIso: '2026-01-15',
    });
    expect(msg).toContain('JAMB UTME');
    expect(msg).toContain('2026-04-15');
    expect(msg).toContain('10');
    expect(msg).toContain('Algebra (algebra): 35%');
    expect(msg).toContain('Comprehension (comprehension): 42%');
  });

  test('user message handles empty weak-topics list gracefully', () => {
    const msg = buildStudyPlanUserMessage({
      examName: 'JAMB UTME',
      examDate: '2026-04-15',
      hoursPerWeek: 10,
      weakTopics: [],
      todayIso: '2026-01-15',
    });
    expect(msg).toContain('No specific weak topics');
  });
});

describe('generate-questions prompt', () => {
  test('user message embeds exam + subject + topic + count + difficulty hint', () => {
    const msg = buildGenerateQuestionsUserMessage({
      examName: 'JAMB UTME',
      subjectName: 'Mathematics',
      topicName: 'Quadratic Equations',
      count: 10,
      difficultyHint: 'harder',
    });
    expect(msg).toContain('Generate 10 questions');
    expect(msg).toContain('JAMB UTME');
    expect(msg).toContain('Mathematics');
    expect(msg).toContain('Quadratic Equations');
    expect(msg).toMatch(/Skew towards difficulty 4–5/);
  });

  test('default difficulty hint is mixed', () => {
    const msg = buildGenerateQuestionsUserMessage({
      examName: 'JAMB UTME',
      subjectName: 'Mathematics',
      topicName: 'Algebra',
      count: 5,
    });
    expect(msg).toMatch(/Distribute across difficulty 2–4/);
  });
});
