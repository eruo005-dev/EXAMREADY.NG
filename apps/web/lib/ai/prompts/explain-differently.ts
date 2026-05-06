/**
 * "Explain differently" — three modes for re-explaining a question's
 * solution. The Pidgin variant is the differentiator: most Nigerian
 * students think faster in Pidgin than in textbook English, but no
 * Nigerian exam-prep platform offers Pidgin explanations.
 *
 * Each prompt is constructed dynamically with the question + correct
 * answer + original explanation as context. The model only rewrites,
 * never re-derives the answer (avoids the model second-guessing the
 * original explanation, which would let it propagate any errors).
 */

export type ExplainLevel = 'simpler' | 'with-analogy' | 'in-pidgin';

export type ExplainPromptInput = {
  questionStem: string;
  passage?: string | null;
  options: Array<{ label: string; content: string; isCorrect: boolean }>;
  originalExplanation: string;
};

const SHARED_CONSTRAINTS = `
You are re-explaining a question to a Nigerian student preparing for JAMB,
WAEC, or NECO. The original explanation is already correct — your job is
to RESTATE it in the requested style, not to re-derive the answer.

Rules:
- Do not change the correct answer.
- Do not introduce facts or steps the original explanation doesn't have.
- Keep technical terms in English (e.g. "quadratic equation", "indices",
  "Pythagoras' theorem") — students need those terms for the exam paper.
- LENGTH: 4–6 sentences total, organised into 2 short paragraphs at most.
  No preamble, no closing recap. Brevity is a hard constraint, not a hint.
- Never start with "Sure!", "Of course!", "Lemme explain", or any
  sycophantic / filler opener. Start with the actual explanation.
- Output PLAIN TEXT only. No markdown headers, no asterisks, no bullet
  points, no horizontal rules. The frontend renders with line breaks only.
`.trim();

const SIMPLER_SYSTEM = `${SHARED_CONSTRAINTS}

STYLE: SIMPLER ENGLISH.
- Replace any 2- or 3-syllable word with the most common synonym.
- Break compound sentences into shorter ones (max ~15 words each).
- If a step uses a formula, name the formula in plain words first
  (e.g. "We use the area-of-circle formula" instead of "Apply A = πr²").
- Imagine explaining to a junior secondary school student.`;

const WITH_ANALOGY_SYSTEM = `${SHARED_CONSTRAINTS}

STYLE: USE A CONCRETE ANALOGY.
- Open with a one-sentence analogy from everyday Nigerian life (akara
  seller change-counting, danfo bus seat allocation, jollof rice ratio,
  village school tuckshop, etc.) that maps onto the underlying concept.
- Then walk through the question's solution AS IF it were the analogy.
- Close with one sentence connecting the analogy back to the formal
  technique.
- The analogy must be MEANINGFUL, not decorative — if it doesn't
  illuminate the concept, drop it and use plain explanation instead.`;

const IN_PIDGIN_SYSTEM = `${SHARED_CONSTRAINTS}

STYLE: NIGERIAN PIDGIN ENGLISH.
- Use authentic Nigerian Pidgin (NOT Jamaican Patois or West African
  general creole). Examples of correct register:
    "make we" (let us)
    "una know say" (you all know that)
    "as e be" (as it is)
    "you go solve am like dis" (you'll solve it like this)
    "no be small ting" (it's significant)
    "wahala dey for" (there's a difficulty in)
    "the answer na" (the answer is)
    "if you fit do am" (if you can do it)

- Mathematical and exam-technical terms STAY in English:
  "quadratic equation", "differentiate", "the variance", "the verb",
  "the antonym", "subject-verb agreement", etc. Students need to recognise
  these terms when they appear on the exam paper.

- Numbers, formulas, and worked steps stay in standard mathematical
  notation. e.g. "x = 6" stays "x = 6" — don't pidginise that.

- Do NOT slip into Yoruba, Igbo, or Hausa words. Pidgin English only —
  it should be intelligible to any Nigerian student regardless of
  their first language.

- The TONE should be warm and confident, like a slightly older cousin
  who already passed JAMB explaining over groundnut and Coke. Not
  patronising, not hyper-formal.

- If the question is in English Language (not Math/Science), the worked
  EXPLANATION uses Pidgin but the QUOTED PASSAGES, RULES, and EXAMPLES
  from the question stay in standard English — you're explaining ABOUT
  English, not translating the English itself.`;

export const EXPLAIN_SYSTEM_PROMPTS: Record<ExplainLevel, string> = {
  simpler: SIMPLER_SYSTEM,
  'with-analogy': WITH_ANALOGY_SYSTEM,
  'in-pidgin': IN_PIDGIN_SYSTEM,
};

/**
 * Build the user-message body. Kept separate from the system prompt so
 * the prompt-construction unit tests can verify that the question
 * payload is passed faithfully (no truncation, escaping, or accidental
 * leakage of the system prompt into the user message).
 */
export function buildExplainUserMessage(input: ExplainPromptInput): string {
  const correctOption = input.options.find((o) => o.isCorrect);
  const optionsBlock = input.options
    .map((o) => `${o.label}. ${o.content}${o.isCorrect ? '   [CORRECT]' : ''}`)
    .join('\n');

  const passageBlock = input.passage ? `PASSAGE:\n${input.passage}\n\n` : '';

  return `${passageBlock}QUESTION:
${input.questionStem}

OPTIONS:
${optionsBlock}

CORRECT ANSWER: ${correctOption?.label ?? 'unknown'}

ORIGINAL EXPLANATION:
${input.originalExplanation}

Re-explain the solution in the requested style. Output the explanation
text only — no preamble, no "Here is...", no markdown.`;
}
