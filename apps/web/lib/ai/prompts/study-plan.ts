/**
 * Study plan generator. Outputs a strict-JSON week-by-week plan that
 * matches the Zod schema below, so the frontend can render it without
 * runtime parsing surprises.
 *
 * We rely on Claude's `tool_use` / structured-output capability rather
 * than free-form JSON-in-text — fewer parsing failures, no markdown
 * fences to strip. The shape below is BOTH the Zod validator and the
 * tool input_schema we send to Claude.
 */
import { z } from 'zod';

export const studyPlanWeekSchema = z.object({
  weekNumber: z.number().int().min(1).max(52),
  startDate: z.string().date(),
  endDate: z.string().date(),
  focus: z.string().min(5).max(200),
  /**
   * Each day of the week is a list of activities. Empty array = rest day.
   * Activities reference topic slugs, question counts, mock-exam types —
   * the frontend turns them into clickable links into the practice modes.
   */
  days: z
    .array(
      z.object({
        dayOfWeek: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
        activities: z.array(
          z.object({
            type: z.enum(['practice', 'revision', 'mock_cbt', 'rest', 'reading']),
            topicSlug: z.string().optional(),
            questionCount: z.number().int().positive().optional(),
            estimatedMinutes: z.number().int().positive(),
            note: z.string().max(300).optional(),
          }),
        ),
      }),
    )
    .length(7),
});

export const studyPlanSchema = z.object({
  summary: z.string().min(20).max(500),
  totalWeeks: z.number().int().min(1).max(52),
  hoursPerWeek: z.number().int().min(1).max(60),
  weeks: z.array(studyPlanWeekSchema).min(1).max(52),
  warnings: z.array(z.string()).max(10).optional(),
});

export type StudyPlan = z.infer<typeof studyPlanSchema>;

export const STUDY_PLAN_SYSTEM_PROMPT = `
You are creating a personalised exam-prep study plan for a Nigerian
student. Output ONLY by calling the output_study_plan tool with all
required fields populated. Do NOT emit any text outside the tool call.

Required fields (populate all of them):
- summary (2-3 sentence motivating overview, confident Nigerian voice)
- totalWeeks (integer, 1-52)
- hoursPerWeek (integer, matches the student's input)
- weeks (array of week objects, each with weekNumber, startDate,
  endDate, focus, days)
- Each week has exactly 7 day objects (mon..sun). Empty rest days are
  fine but the day MUST be present in the array.

Plan-shape constraints:
- Exam date is fixed; total weeks = ceil((examDate - today) / 7).
  If exam is < 1 week away, output a single intensive week with daily
  activities. If exam is > 12 weeks away, generate up to 12 weeks and
  add a 'warnings' note explaining you've capped at 12 to keep the
  plan actionable.
- hoursPerWeek is the student's available time. Don't exceed it. If
  hoursPerWeek < 5, warn that it's likely insufficient for the volume
  of material.
- weakTopics are the student's verified weak areas. The plan must
  spend the FIRST 60% of time on these, then broaden in later weeks.
- Mock CBT exams every 2 weeks (or every week in the final 3 weeks).
- One full rest day per week (typically Sunday).
- Each day's total estimatedMinutes must be ≤ hoursPerWeek/6 × 60
  (assuming 6 working days/week).
- 'note' on activities should be concrete and actionable
  ("Focus on quadratic equations, target 75% accuracy" — NOT
  "Practice and review your topics").

Things you must NOT do:
- Invent topic slugs. Only use slugs the user provided as weak topics
  or generic phrases like "english-comprehension".
- Promise a score or guarantee passing. Plans help; nothing guarantees.
- Recommend more hours than the student gave you.
- Output anything outside the JSON tool call.
- Skip the days array on any week. All 7 days must be present.
`.trim();

/**
 * The tool definition handed to whichever provider satisfies the call.
 * `schema` is plain JSON Schema — Anthropic adapts it to `input_schema`,
 * DeepSeek (via OpenAI function calling) adapts it to `parameters`.
 *
 * Same source of truth feeds the Zod validator above so the model
 * output matches whatever shape we trust at the persistence layer.
 */
export const STUDY_PLAN_TOOL = {
  name: 'output_study_plan',
  description: "Output the student's personalised study plan.",
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      totalWeeks: { type: 'integer', minimum: 1, maximum: 52 },
      hoursPerWeek: { type: 'integer', minimum: 1, maximum: 60 },
      weeks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            weekNumber: { type: 'integer', minimum: 1 },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            focus: { type: 'string' },
            days: {
              type: 'array',
              minItems: 7,
              maxItems: 7,
              items: {
                type: 'object',
                properties: {
                  dayOfWeek: {
                    type: 'string',
                    enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
                  },
                  activities: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: {
                          type: 'string',
                          enum: ['practice', 'revision', 'mock_cbt', 'rest', 'reading'],
                        },
                        topicSlug: { type: 'string' },
                        questionCount: { type: 'integer', minimum: 1 },
                        estimatedMinutes: { type: 'integer', minimum: 1 },
                        note: { type: 'string' },
                      },
                      required: ['type', 'estimatedMinutes'],
                    },
                  },
                },
                required: ['dayOfWeek', 'activities'],
              },
            },
          },
          required: ['weekNumber', 'startDate', 'endDate', 'focus', 'days'],
        },
      },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'totalWeeks', 'hoursPerWeek', 'weeks'],
  },
} as const;

export type StudyPlanInput = {
  examName: string;
  examDate: string;
  hoursPerWeek: number;
  weakTopics: Array<{ slug: string; name: string; accuracyPercent: number }>;
  todayIso: string;
};

export function buildStudyPlanUserMessage(input: StudyPlanInput): string {
  const weakTopicsBlock =
    input.weakTopics.length === 0
      ? 'No specific weak topics identified yet — student is early in their prep.'
      : input.weakTopics
          .map((t) => `- ${t.name} (${t.slug}): ${t.accuracyPercent}% accuracy`)
          .join('\n');

  return `Today is ${input.todayIso}.
Target exam: ${input.examName}
Exam date: ${input.examDate}
Hours per week available: ${input.hoursPerWeek}

Weak topics from this student's recent practice:
${weakTopicsBlock}

Generate the study plan via the output_study_plan tool. Use ONLY the
topic slugs above for topicSlug fields; for non-weak-topic activities
use generic slugs like "general-revision" or omit topicSlug entirely.`;
}
