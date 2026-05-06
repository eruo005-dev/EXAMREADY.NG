/**
 * CSV question import — pure-JS unit tests, no DB needed.
 */
import { describe, expect, test } from 'vitest';

import { parseCsvQuestions, type SlugLookups } from '../csv-questions';

const lookups: SlugLookups = {
  examSlugToId: new Map([['jamb-utme', '00000000-0000-0000-0000-000000000001']]),
  subjectSlugToId: new Map([
    ['jamb-utme/mathematics', '00000000-0000-0000-0000-000000000010'],
    ['jamb-utme/english-language', '00000000-0000-0000-0000-000000000011'],
  ]),
  topicSlugToId: new Map([
    ['jamb-utme/mathematics/algebra', '00000000-0000-0000-0000-000000000100'],
    ['jamb-utme/english-language/synonyms-antonyms', '00000000-0000-0000-0000-000000000101'],
  ]),
};

describe('parseCsvQuestions', () => {
  test('parses a happy-path row into the canonical shape', () => {
    const csv = [
      'exam_slug,subject_slug,topic_slug,difficulty,year,source,stem,explanation,option_a,option_b,option_c,option_d,correct_option',
      'jamb-utme,mathematics,algebra,2,2023,JAMB 2023,"Solve: 2x + 5 = 17","Subtract 5 then divide by 2.",x = 4,x = 6,x = 12,x = 24,B',
    ].join('\n');

    const result = parseCsvQuestions(csv, lookups);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0]!;
    expect(row.examId).toBe('00000000-0000-0000-0000-000000000001');
    expect(row.subjectId).toBe('00000000-0000-0000-0000-000000000010');
    expect(row.topicId).toBe('00000000-0000-0000-0000-000000000100');
    expect(row.questionType).toBe('mcq_single');
    expect(row.difficulty).toBe(2);
    expect(row.year).toBe(2023);
    expect(row.source).toBe('JAMB 2023');
    expect(row.options).toHaveLength(4);
    expect(row.options.find((o) => o.label === 'B')?.isCorrect).toBe(true);
    expect(row.options.filter((o) => o.isCorrect)).toHaveLength(1);
  });

  test('detects mcq_multi when correct_option has multiple labels', () => {
    const csv = [
      'exam_slug,subject_slug,topic_slug,difficulty,stem,explanation,option_a,option_b,option_c,correct_option',
      'jamb-utme,mathematics,algebra,3,A short stem,Explanation here.,Choice A,Choice B,Choice C,"A,C"',
    ].join('\n');

    const result = parseCsvQuestions(csv, lookups);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.questionType).toBe('mcq_multi');
    expect(result.rows[0]!.options.filter((o) => o.isCorrect)).toHaveLength(2);
  });

  test('detects comprehension when passage is non-empty', () => {
    const csv = [
      'exam_slug,subject_slug,topic_slug,difficulty,passage,stem,explanation,option_a,option_b,correct_option',
      'jamb-utme,english-language,synonyms-antonyms,2,"This is a passage.",A short stem,Explanation here.,A choice,B choice,A',
    ].join('\n');

    const result = parseCsvQuestions(csv, lookups);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]!.questionType).toBe('comprehension');
    expect(result.rows[0]!.passage).toBe('This is a passage.');
  });

  test('reports unknown exam_slug as a per-row error', () => {
    const csv = [
      'exam_slug,subject_slug,topic_slug,difficulty,stem,explanation,option_a,option_b,correct_option',
      'unknown-exam,mathematics,algebra,2,A short stem,An adequate explanation,A choice,B choice,A',
    ].join('\n');

    const result = parseCsvQuestions(csv, lookups);
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.row).toBe(2);
    expect(result.errors[0]!.message).toMatch(/Unknown exam_slug/);
  });

  test('reports missing required columns', () => {
    const csv = ['exam_slug,topic_slug,stem', 'jamb-utme,algebra,Stem'].join('\n');
    const result = parseCsvQuestions(csv, lookups);
    expect(result.errors[0]!.message).toMatch(/Missing required columns/);
  });

  test('reports correct_option that doesn\'t match any option label', () => {
    const csv = [
      'exam_slug,subject_slug,topic_slug,difficulty,stem,explanation,option_a,option_b,correct_option',
      'jamb-utme,mathematics,algebra,2,A short stem,An adequate explanation,A choice,B choice,Z',
    ].join('\n');

    const result = parseCsvQuestions(csv, lookups);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/correct_option references missing option/);
  });

  test('respects max-rows cap', () => {
    const header =
      'exam_slug,subject_slug,topic_slug,difficulty,stem,explanation,option_a,option_b,correct_option';
    const data = Array.from(
      { length: 5 },
      (_, i) => `jamb-utme,mathematics,algebra,2,A short stem ${i},An adequate explanation,A choice,B choice,A`,
    );
    const csv = [header, ...data].join('\n');

    const result = parseCsvQuestions(csv, lookups, { maxRows: 3 });
    expect(result.rows).toEqual([]);
    expect(result.errors[0]!.message).toMatch(/Too many rows/);
  });

  test('skips empty trailing lines without erroring', () => {
    const csv = [
      'exam_slug,subject_slug,topic_slug,difficulty,stem,explanation,option_a,option_b,correct_option',
      'jamb-utme,mathematics,algebra,2,A short stem,Explanation here.,A choice,B choice,A',
      '',
      '',
    ].join('\n');

    const result = parseCsvQuestions(csv, lookups);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });
});
