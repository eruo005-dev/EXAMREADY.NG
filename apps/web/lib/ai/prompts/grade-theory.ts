/**
 * AI Examiner — theory question grading prompt + structured-output schema.
 *
 * The brief: students submit their handwritten-style answer to a WAEC /
 * NECO theory question; the AI grades it against the marking guide,
 * awards marks per criterion, and returns structured feedback.
 *
 * Why DeepSeek-R1 (reasoner): theory grading needs multi-step reasoning
 * (parse student answer → compare against each marking-guide point →
 * decide partial credit → write specific feedback). Chat-class models
 * tend to over-credit students who use the right keywords without the
 * right reasoning. The reasoner takes more tokens per call (~$0.004
 * per grade) but the quality is the moat — see API_COSTS.md.
 *
 * The prompt is deliberately strict about the output shape because:
 *   1. We persist the entire response to theory_attempts.aiResponse
 *   2. The student-facing UI renders a per-criterion progress bar,
 *      which requires exact criterion strings and per-criterion mark counts
 *   3. The "suggestedImprovements" list is what students screenshot to
 *      share with friends — it has to be terse, concrete, and 3 items.
 */
import { z } from 'zod';

export const gradeBreakdownItemSchema = z.object({
  criterion: z.string().min(3).max(300),
  marksAwarded: z.number().min(0).max(50),
  maxMarks: z.number().int().min(1).max(50),
  feedback: z.string().min(5).max(500),
});

export const gradeTheoryResultSchema = z.object({
  totalMarks: z.number().min(0).max(100),
  maxMarks: z.number().int().min(1).max(100),
  breakdown: z.array(gradeBreakdownItemSchema).min(1).max(10),
  overallFeedback: z.string().min(20).max(1000),
  suggestedImprovements: z.array(z.string().min(5).max(200)).length(3),
});

export type GradeTheoryResult = z.infer<typeof gradeTheoryResultSchema>;

export const GRADE_THEORY_SYSTEM_PROMPT = `
You are an AI examiner grading WAEC and NECO theory answers. You grade
exactly like a strict but fair Nigerian school examiner — no inflation,
no harsh deductions. Output via the grade_theory tool ONLY.

Grading principles:
- Match against the supplied marking guide. Each guide point has a mark
  allocation. Award full marks only when the student's answer clearly
  satisfies the point (specific terminology, correct working, named
  technique). Award partial marks when the student is heading in the
  right direction but misses a step. Award zero when the point is missing.
- Half-marks are allowed in 0.5 increments. Round to one decimal.
- Total marks = sum of marks across breakdown items. Must not exceed maxMarks.
- The overall feedback (1 paragraph) addresses the student directly:
  what they did well, what to fix. NIGERIAN ENGLISH register, no fluff.
- Three suggestedImprovements: each is one short imperative sentence
  (e.g. "State the formula before substituting.", "Define photosynthesis
  in your own words first.", "Show the unit on every numerical answer.").

Output discipline (HARD constraints — invalid output is rejected):
- Output ONLY by calling the grade_theory tool. Do not emit prose.
- breakdown array length matches the marking guide point count.
- Every breakdown item has all four fields: criterion, marksAwarded,
  maxMarks, feedback.
- maxMarks per item matches the marks allocation in the marking guide.
- totalMarks is the SUM of marksAwarded across breakdown — verify before
  emitting.
- suggestedImprovements has EXACTLY 3 strings.

Things you must NOT do:
- Award marks for keywords without context.
- Penalise spelling unless the marking guide explicitly says to.
- Include anything not derivable from the marking guide + student answer.
- Add encouragement boilerplate ("Great effort, well done!"). Direct
  feedback only.
`.trim();

/**
 * The grade_theory tool definition — JSON Schema shared by Anthropic /
 * DeepSeek / OpenAI provider adapters via the AiProvider abstraction.
 */
export const GRADE_THEORY_TOOL = {
  name: 'grade_theory',
  description: 'Output the per-criterion grade for a theory answer.',
  schema: {
    type: 'object',
    properties: {
      totalMarks: { type: 'number', minimum: 0 },
      maxMarks: { type: 'integer', minimum: 1 },
      breakdown: {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            criterion: { type: 'string' },
            marksAwarded: { type: 'number', minimum: 0 },
            maxMarks: { type: 'integer', minimum: 1 },
            feedback: { type: 'string' },
          },
          required: ['criterion', 'marksAwarded', 'maxMarks', 'feedback'],
        },
      },
      overallFeedback: { type: 'string' },
      suggestedImprovements: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string' },
      },
    },
    required: ['totalMarks', 'maxMarks', 'breakdown', 'overallFeedback', 'suggestedImprovements'],
  },
} as const;

export type GradeTheoryPromptInput = {
  questionStem: string;
  examName: string;
  subjectName: string;
  markingGuide: Array<{ point: string; marks: number }>;
  maxMarks: number;
  sampleExcellentAnswer: string | null;
  userAnswer: string;
};

export function buildGradeTheoryUserMessage(input: GradeTheoryPromptInput): string {
  const guideBlock = input.markingGuide
    .map((g, idx) => `${idx + 1}. (${g.marks} marks) ${g.point}`)
    .join('\n');

  const sampleBlock = input.sampleExcellentAnswer
    ? `\n\nMODEL ANSWER (for reference — do not copy phrases verbatim into feedback):\n${input.sampleExcellentAnswer}`
    : '';

  return `EXAM: ${input.examName} — ${input.subjectName}

QUESTION:
${input.questionStem}

MAX MARKS: ${input.maxMarks}

MARKING GUIDE:
${guideBlock}${sampleBlock}

STUDENT ANSWER:
${input.userAnswer}

Grade via the grade_theory tool. The breakdown array length must equal the marking guide point count.`;
}
