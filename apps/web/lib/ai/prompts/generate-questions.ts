/**
 * Question generation for the admin moderation queue.
 *
 * Generates a batch of N questions on a topic. The output is structured
 * via tool_use so it parses cleanly without text-extraction. Generated
 * questions land in the database with is_active=false and
 * generated_by_model set; an admin reviews each one before approving.
 *
 * The prompt deliberately leans HARD on quality constraints:
 *  - every distractor must be a "tempting wrong" that targets a real
 *    misconception, not "just a wrong number"
 *  - explanations must name the technique, not just walk through arithmetic
 *  - we explicitly forbid fabricated past-paper sources
 */
import { z } from 'zod';

export const generatedOptionSchema = z.object({
  label: z.enum(['A', 'B', 'C', 'D', 'E']),
  content: z.string().min(1).max(2000),
  isCorrect: z.boolean(),
  whyTempting: z.string().max(500).optional(),
});

export const generatedQuestionSchema = z.object({
  stem: z.string().min(10).max(2000),
  questionType: z.enum(['mcq_single', 'mcq_multi', 'true_false']).default('mcq_single'),
  difficulty: z.number().int().min(1).max(5),
  options: z.array(generatedOptionSchema).min(2).max(5),
  explanation: z.string().min(40).max(2000),
  estimatedSolveTimeSeconds: z.number().int().min(15).max(600).optional(),
});

export const generatedQuestionBatchSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1).max(20),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type GeneratedQuestionBatch = z.infer<typeof generatedQuestionBatchSchema>;

export const GENERATE_QUESTIONS_SYSTEM_PROMPT = `
You generate exam-style multiple-choice questions for Nigerian students
preparing for JAMB UTME, WAEC SSCE, NECO SSCE, and Post-UTME. Output
ONLY via the provided tool — no preamble, no markdown.

FORMAT (hard constraint — invalid output is rejected):
- Each question has EXACTLY 4 options labelled A, B, C, D — never 3, 5,
  or "all of the above". Use mcq_multi only when the question genuinely
  has multiple correct answers; otherwise mcq_single is the default.
- For mcq_single, exactly ONE option has isCorrect: true.
- Explanation is 4–6 sentences. Names the technique. No markdown.
- Stem is 1–4 sentences (or up to 200 words for comprehension). No
  trailing whitespace, no decorative ASCII.

Quality bar (these are not guidelines, they are pass/fail gates):

1. STEM CLARITY: every question must be answerable from the stem alone
   without external context the student wouldn't have on the exam paper.
2. EXACTLY ONE correct answer for mcq_single (or all marked correct ones
   for mcq_multi must be defensibly correct under the same criterion).
3. EVERY DISTRACTOR is a "tempting wrong" — it must be the answer a
   student would arrive at by making a SPECIFIC named misconception
   (sign error, off-by-one, wrong formula choice, dropped negative,
   confused tense, false friend in vocabulary). The 'whyTempting' field
   captures that misconception per option.
4. EXPLANATION names the technique used:
   "Apply Vieta's formulas...", "Use subject-verb agreement with
   'each of'...", "Difference of two squares: a² − b² = (a-b)(a+b)..."
   NOT a step-by-step retread without naming.
5. DIFFICULTY:
   1 = recall, recognises a definition or applies a single formula
   2 = one-step application
   3 = two-step application or careful selection of approach
   4 = multi-step, requires identifying the right technique
   5 = synthesis or non-obvious technique selection
   Aim for distribution across 2–4; few level-1s, few level-5s.
6. NIGERIAN CONTEXT where natural — a Math word problem about market
   prices uses Naira (₦), a comprehension passage references Nigerian
   places where appropriate. NOT every question needs Nigerian context;
   forced cultural references read as condescending.
7. NO PAST-PAPER FABRICATION: do NOT include 'source' fields like
   "JAMB 2023" unless we explicitly tell you the question is from a
   real past paper. Generated questions will be marked
   "ExamReady Practice" by the importer.

Anti-patterns to avoid:
- Symmetric distractors (e.g. options 1, 2, 3, 4 in arithmetic order)
- "All of the above" / "None of the above" — these are lazy
- Trick questions where the right answer depends on a tiny word the
  student missed; this is bad pedagogy
- Distractors that are obviously wrong on inspection (e.g. negative
  number where the answer must be positive); waste of a slot
- Comprehension passages longer than 200 words; exam stamina matters
`.trim();

export const GENERATE_QUESTIONS_TOOL = {
  name: 'output_questions_batch',
  description: 'Output a batch of generated exam questions for moderation.',
  schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            stem: { type: 'string' },
            questionType: {
              type: 'string',
              enum: ['mcq_single', 'mcq_multi', 'true_false'],
            },
            difficulty: { type: 'integer', minimum: 1, maximum: 5 },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 5,
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E'] },
                  content: { type: 'string' },
                  isCorrect: { type: 'boolean' },
                  whyTempting: { type: 'string' },
                },
                required: ['label', 'content', 'isCorrect'],
              },
            },
            explanation: { type: 'string' },
            estimatedSolveTimeSeconds: { type: 'integer', minimum: 15, maximum: 600 },
          },
          required: ['stem', 'difficulty', 'options', 'explanation'],
        },
      },
    },
    required: ['questions'],
  },
} as const;

export type GenerateQuestionsInput = {
  examName: string;
  subjectName: string;
  topicName: string;
  count: number;
  difficultyHint?: 'easier' | 'harder' | 'mixed';
};

export function buildGenerateQuestionsUserMessage(input: GenerateQuestionsInput): string {
  const difficultyDirection = {
    easier: 'Skew towards difficulty 1–2; we already have enough harder questions.',
    harder: 'Skew towards difficulty 4–5; we need more challenging items.',
    mixed: 'Distribute across difficulty 2–4 with a couple of 1s and 5s.',
  }[input.difficultyHint ?? 'mixed'];

  return `Generate ${input.count} questions for the topic below.

Exam: ${input.examName}
Subject: ${input.subjectName}
Topic: ${input.topicName}
Difficulty distribution: ${difficultyDirection}

Output via the output_questions_batch tool.`;
}
