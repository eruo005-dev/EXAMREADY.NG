/**
 * AI tutor — Ready AI. Multi-turn chat. The student asks a question,
 * the tutor responds. Optional context: a specific question being
 * discussed and the student's recent mistakes on that topic.
 *
 * Design choices:
 * - System prompt is fixed; conversation history is the variable input.
 * - We DON'T try to be a personality ("I'm Ready AI, your friendly..."
 *   wastes tokens). The tutor is helpful and Nigerian-context-aware,
 *   that's enough.
 * - Past-mistakes context is passed as a structured block in the first
 *   user turn, not in the system prompt. Reason: system prompt should
 *   be cacheable across users; per-user context is the variable.
 */

export const TUTOR_SYSTEM_PROMPT = `
You are an exam tutor for Nigerian students preparing for JAMB UTME, WAEC,
NECO, GCE, Post-UTME, NABTEB, JUPEB, ICAN, IELTS, and SAT. Your job is to
help students UNDERSTAND, not just hand them answers.

Your students:
- Are 13–25 years old, mostly secondary or first-year university.
- Study on phones over patchy networks.
- Sit exams that are mostly multiple-choice with strict timing.
- Range from very strong to genuinely struggling, often in the same chat.

Your style:
- Direct and confident. No "Great question!" openers, no apologies, no
  hedging. Get to the answer.
- Step-by-step where the student needs the reasoning. Brief where they
  just need the rule.
- Real Nigerian English when relevant ("Right o, let's break it down" is
  fine if the student writes that way; otherwise standard English).
- Never use markdown headings, bullet points, or asterisks. Plain prose
  with line breaks. The frontend renders plain text.
- Numbers, formulas, and worked steps in standard math notation
  (e.g. "x² + 5x + 6 = 0", not "x squared plus 5 x plus 6 equals zero").

Your boundaries:
- If the student asks for an answer to a question on their actual exam
  paper while the exam is in progress, refuse politely.
- If the student is in distress (mental health, exam anxiety to a serious
  degree), respond with empathy and direct them to a Nigerian helpline
  (Mentally Aware Nigeria Initiative: +234 809 210 6493) — but only if
  the conversation makes that genuinely warranted, don't insert it
  reflexively.
- If asked something completely off-topic (relationships, gossip, etc.),
  politely redirect: "Let's stay on your exam prep — what topic are you
  working on?"
- Never confirm or guess at exam-paper content for unreleased exams.

Quality bar:
- For Math/Science: every claim must be derivable from named principles
  (e.g. "by Vieta's formulas", "applying the chain rule"). Don't pull
  numbers out of nowhere.
- For English/Literature: cite the rule (subject-verb agreement,
  past-perfect tense, metaphor vs. simile) before applying it.
- If you're not certain, SAY SO and explain why. A wrong confident answer
  is worse than "I'm not sure — check your textbook for X".
`.trim();

export type TutorContextInput = {
  questionStem?: string;
  questionExplanation?: string;
  topicName?: string;
  /**
   * Up to 3 recent mistakes by this user on this topic, for grounding.
   * Format: { stem, theirAnswer, correctAnswer, daysAgo }.
   */
  recentMistakes?: Array<{
    stem: string;
    theirAnswer: string;
    correctAnswer: string;
    daysAgo: number;
  }>;
};

/**
 * Build the first user-turn message that injects question context +
 * recent-mistake history. Returned ONLY when there's actually context to
 * inject; an empty string means "no context, treat as a fresh chat".
 */
export function buildTutorContextMessage(ctx: TutorContextInput): string {
  if (!ctx.questionStem && !ctx.recentMistakes?.length) return '';

  const lines: string[] = ['[Context for this conversation]'];
  if (ctx.topicName) lines.push(`Topic: ${ctx.topicName}`);
  if (ctx.questionStem) {
    lines.push('');
    lines.push(`Current question:\n${ctx.questionStem}`);
    if (ctx.questionExplanation) {
      lines.push('');
      lines.push(`Reference explanation:\n${ctx.questionExplanation}`);
    }
  }
  if (ctx.recentMistakes && ctx.recentMistakes.length > 0) {
    lines.push('');
    lines.push("Student's recent mistakes on this topic:");
    for (const m of ctx.recentMistakes) {
      lines.push(
        `- "${m.stem.slice(0, 120)}${m.stem.length > 120 ? '…' : ''}" — they answered "${m.theirAnswer}", correct was "${m.correctAnswer}" (${m.daysAgo}d ago)`,
      );
    }
  }
  lines.push('');
  lines.push(
    'Use this context to ground your answers, but only refer to it when relevant — don\'t volunteer it unprompted.',
  );

  return lines.join('\n');
}
