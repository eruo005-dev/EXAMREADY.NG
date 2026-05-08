/**
 * CBT runner — JAMB-fidelity exam interface.
 *
 * This is the most important UI surface in the app. The contract is:
 * a candidate practising on ExamReady should sit the actual JAMB CBT
 * with no UI surprises. Every key, every visual cue, every keyboard
 * shortcut maps 1:1.
 *
 * Layout (full-screen, no app shell):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Candidate name · Subject · Time HH:MM:SS · Question N / Total │ ← top bar
 *   ├──────────────────────────────────────────────┬────────────────┤
 *   │  Question stem (with passage above if any)    │ Q palette grid │
 *   │  ───────────────────────────────────────────  │ (color-coded)  │
 *   │  (A) option 1                                 │                │
 *   │  (B) option 2                                 │                │
 *   │  (C) option 3                                 │                │
 *   │  (D) option 4                                 │                │
 *   ├──────────────────────────────────────────────┴────────────────┤
 *   │ [P] Previous · [N] Next · [R] Clear · [K] Calc · [S] Submit    │ ← bottom bar
 *   └──────────────────────────────────────────────────────────────┘
 *
 * 9-key keyboard navigation (NON-NEGOTIABLE per Sprint 7 §4.3):
 *   A B C D — pick an option
 *   P       — previous question
 *   N       — next question
 *   S       — submit (with confirmation)
 *   R       — reverse / clear current selection
 *   K       — toggle calculator (NOT C, which is option-C)
 *
 * The runner is intentionally a dumb client component: it renders what
 * it's given and persists answers via the existing
 * `/api/attempts/[attemptId]/answer` endpoint. Server-authoritative
 * timer + final scoring continue to live in the existing `submit`
 * endpoint — Phase 4 ships the UI, not new server semantics.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { JambCalculator } from './JambCalculator';
import { QuestionPalette, type PaletteEntry } from './QuestionPalette';

export interface CbtQuestion {
  id: string;
  /** Position in the paper (0-indexed). */
  index: number;
  stem: string;
  passage?: string;
  options: { id: string; label: string; content: string }[];
  /** Optional subject grouping for multi-subject (full-mock) layout. */
  subject?: { id: string; name: string };
}

export interface CbtAttemptInfo {
  id: string;
  /** Display name shown in the top bar. */
  candidateName: string;
  /** Subject name shown when it's a single-subject mock. */
  subjectLabel: string;
  /** Total seconds remaining at server time when the page was rendered. */
  remainingSeconds: number;
  /** When the attempt expires (server time). Used to extrapolate live timer. */
  endsAt: string;
}

interface Props {
  attempt: CbtAttemptInfo;
  questions: CbtQuestion[];
  /** Server-provided answer state — questionId → optionId | null. */
  initialAnswers: Record<string, string | null>;
  /** Server-provided flag state — questionId → boolean. */
  initialFlags: Record<string, boolean>;
  /** Callback to persist a single answer. CbtRunner debounces server-side. */
  onAnswer(questionId: string, optionId: string | null): Promise<void>;
  /** Callback to toggle flag state. Server persists in the same row. */
  onFlag(questionId: string, flagged: boolean): Promise<void>;
  /** Callback for SUBMIT — final commit. Caller redirects to /results. */
  onSubmit(): Promise<void>;
}

export function CbtRunner({
  attempt,
  questions,
  initialAnswers,
  initialFlags,
  onAnswer,
  onFlag,
  onSubmit,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers);
  const [flags, setFlags] = useState(initialFlags);
  const [calcOpen, setCalcOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const total = questions.length;
  const current = questions[currentIndex];

  // ---- timer ----
  const endsAtMs = useMemo(() => new Date(attempt.endsAt).getTime(), [attempt.endsAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = Math.max(0, Math.floor((endsAtMs - now) / 1000));
  const remHours = Math.floor(remaining / 3600);
  const remMins = Math.floor((remaining % 3600) / 60);
  const remSecs = remaining % 60;
  const timerHHMMSS = `${remHours.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  const isWarning1Min = remaining <= 60;
  const isWarning5Min = remaining <= 300 && remaining > 60;

  // Auto-submit when timer hits zero — server enforces too, but we
  // commit client-side first so the user sees the redirect immediately.
  useEffect(() => {
    if (remaining === 0 && !submitting) {
      setSubmitting(true);
      void onSubmit();
    }
  }, [remaining, submitting, onSubmit]);

  // localStorage snapshot every 10s for network-resilience. Server is
  // the source of truth on submit; this is purely UX insurance.
  useEffect(() => {
    const t = setInterval(() => {
      try {
        localStorage.setItem(`cbt:${attempt.id}`, JSON.stringify({ answers, flags, currentIndex }));
      } catch {
        /* quota / private mode — ignore */
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [attempt.id, answers, flags, currentIndex]);

  // ---- answer + flag handlers ----
  const pickOption = useCallback(
    (optionId: string | null) => {
      if (!current) return;
      setAnswers((a) => ({ ...a, [current.id]: optionId }));
      void onAnswer(current.id, optionId);
    },
    [current, onAnswer],
  );

  const toggleFlag = useCallback(
    (idx: number) => {
      const q = questions[idx];
      if (!q) return;
      const next = !flags[q.id];
      setFlags((f) => ({ ...f, [q.id]: next }));
      void onFlag(q.id, next);
    },
    [questions, flags, onFlag],
  );

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const requestSubmit = useCallback(() => setConfirmSubmit(true), []);
  const doSubmit = useCallback(async () => {
    setConfirmSubmit(false);
    setSubmitting(true);
    await onSubmit();
  }, [onSubmit]);

  // ---- 9-key keyboard handler ----
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      // Skip when focus is in an input or inside the calculator panel.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-cbt-calc="root"]')) return;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();

      if (current && (k === 'a' || k === 'b' || k === 'c' || k === 'd')) {
        const letterIndex = { a: 0, b: 1, c: 2, d: 3 }[k as 'a'];
        const opt = current.options[letterIndex];
        if (opt) {
          e.preventDefault();
          pickOption(opt.id);
        }
      } else if (k === 'p') {
        e.preventDefault();
        goPrev();
      } else if (k === 'n') {
        e.preventDefault();
        goNext();
      } else if (k === 'r') {
        e.preventDefault();
        pickOption(null);
      } else if (k === 'k') {
        e.preventDefault();
        setCalcOpen((v) => !v);
      } else if (k === 's') {
        e.preventDefault();
        requestSubmit();
      } else if (k === 'f') {
        // Bonus: F to toggle flag on the current question. JAMB doesn't
        // expose this, but every Nigerian CBT trainer has it. The 9-key
        // canon is preserved (A/B/C/D/P/N/S/R/K) — F is additive.
        e.preventDefault();
        toggleFlag(currentIndex);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [current, pickOption, goPrev, goNext, requestSubmit, toggleFlag, currentIndex]);

  // ---- palette entries ----
  const paletteEntries = useMemo<PaletteEntry[]>(() => {
    return questions.map((q) => ({
      index: q.index,
      answered: !!answers[q.id],
      flagged: !!flags[q.id],
    }));
  }, [questions, answers, flags]);

  if (!current) {
    return <div className="p-8">No questions in this attempt.</div>;
  }

  const selected = answers[current.id] ?? null;
  const answeredCount = Object.values(answers).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      {/* TOP BAR */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-col">
          <span className="text-xs uppercase tracking-wide text-slate-500">Candidate</span>
          <span className="text-sm font-medium">{attempt.candidateName}</span>
        </div>
        <div className="flex flex-1 flex-col items-center">
          <span className="text-xs uppercase tracking-wide text-slate-500">Subject</span>
          <span className="text-sm font-medium">
            {current.subject?.name ?? attempt.subjectLabel}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center">
          <span className="text-xs uppercase tracking-wide text-slate-500">Time remaining</span>
          <span
            className={`font-mono text-lg tabular-nums ${
              isWarning1Min
                ? 'animate-pulse text-red-600 dark:text-red-400'
                : isWarning5Min
                  ? 'text-amber-600 dark:text-amber-400'
                  : ''
            }`}
            data-testid="cbt-timer"
          >
            {timerHHMMSS}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-end">
          <span className="text-xs uppercase tracking-wide text-slate-500">Question</span>
          <span className="font-mono text-sm tabular-nums">
            {currentIndex + 1} / {total} · {answeredCount} answered
          </span>
        </div>
      </header>

      {/* MAIN + PALETTE */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-12">
          {current.passage && (
            <div className="prose prose-sm dark:prose-invert mb-6 max-w-3xl rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Passage</div>
              <div className="whitespace-pre-wrap">{current.passage}</div>
            </div>
          )}
          <div className="max-w-3xl">
            <div className="mb-4 text-base leading-7" data-testid="cbt-stem">
              {current.stem}
            </div>
            <ol className="space-y-2" role="radiogroup" aria-label="Answer options">
              {current.options.map((o, idx) => {
                const letter = ['A', 'B', 'C', 'D'][idx] ?? '?';
                const isPicked = selected === o.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isPicked}
                      onClick={() => pickOption(o.id)}
                      className={`flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors ${
                        isPicked
                          ? 'border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 flex-none items-center justify-center rounded-full font-mono text-sm ${
                          isPicked
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {letter}
                      </span>
                      <span className="flex-1">{o.content}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </main>

        <aside className="hidden w-72 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white px-4 py-4 lg:flex dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
              Question palette
            </div>
            <QuestionPalette
              entries={paletteEntries}
              currentIndex={currentIndex}
              onJump={setCurrentIndex}
              onToggleFlag={toggleFlag}
            />
          </div>
          <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
            <Legend color="bg-green-200" label="Answered" />
            <Legend color="bg-yellow-300" label="Flagged" />
            <Legend color="bg-blue-600" label="Current" />
            <Legend color="bg-slate-200" label="Unanswered" />
          </div>
          <div className="text-xs text-slate-500">
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">Keys</p>
            <ul className="space-y-0.5 font-mono text-[11px]">
              <li>A B C D — pick option</li>
              <li>P — previous · N — next</li>
              <li>R — clear · K — calculator</li>
              <li>F — flag · S — submit</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* BOTTOM BAR */}
      <footer className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-2">
          <BarBtn label="Previous (P)" onClick={goPrev} disabled={currentIndex === 0} />
          <BarBtn label="Next (N)" onClick={goNext} disabled={currentIndex === total - 1} />
          <BarBtn label="Clear (R)" onClick={() => pickOption(null)} disabled={!selected} />
          <BarBtn label="Flag (F)" onClick={() => toggleFlag(currentIndex)} />
        </div>
        <div className="flex gap-2">
          <BarBtn label="Calculator (K)" onClick={() => setCalcOpen((v) => !v)} />
          <BarBtn
            label="Submit (S)"
            onClick={requestSubmit}
            variant="primary"
            disabled={submitting}
          />
        </div>
      </footer>

      <JambCalculator open={calcOpen} onClose={() => setCalcOpen(false)} />

      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 max-w-[90vw] rounded-lg bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="mb-2 text-lg font-semibold">Submit attempt?</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              You have answered <strong>{answeredCount}</strong> of {total} question
              {total === 1 ? '' : 's'}. You cannot return to this attempt after submitting.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <BarBtn label="Cancel" onClick={() => setConfirmSubmit(false)} />
              <BarBtn label="Submit" onClick={doSubmit} variant="primary" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BarBtn({
  label,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary';
}) {
  const cls =
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-400'
      : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:bg-slate-100 disabled:text-slate-400';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${cls} rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-700`}
    >
      {label}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded ${color}`} />
      <span>{label}</span>
    </div>
  );
}
