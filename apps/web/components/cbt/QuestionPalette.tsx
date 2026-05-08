/**
 * Question palette — JAMB-style grid of question numbers in the right
 * sidebar of the CBT runner.
 *
 * Color states (matches JAMB CBT and what every Nigerian student
 * recognises from ExamGuide / FlashLearners / TestDriller):
 *   - green   : answered
 *   - yellow  : flagged for review
 *   - blue    : current
 *   - gray    : unanswered
 *
 * Behaviour:
 *   - Click a cell → CbtRunner navigates to that question.
 *   - Right-click (long-press on mobile) → toggle flag.
 *   - Live updates as the user answers / flags.
 *
 * Built for grids up to 180 cells (JAMB full mock) without virtualisation
 * — at that size a simple grid is performant enough.
 */
'use client';

import { Flag } from 'lucide-react';
import { type MouseEvent, useCallback } from 'react';

export interface PaletteEntry {
  index: number;
  /** True when the user has selected at least one option. */
  answered: boolean;
  /** True when the user has flagged for review. */
  flagged: boolean;
}

interface Props {
  entries: PaletteEntry[];
  currentIndex: number;
  onJump(index: number): void;
  onToggleFlag(index: number): void;
}

export function QuestionPalette({ entries, currentIndex, onJump, onToggleFlag }: Props) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>, idx: number) => {
      if (e.button === 0) onJump(idx);
    },
    [onJump],
  );
  const handleContext = useCallback(
    (e: MouseEvent<HTMLButtonElement>, idx: number) => {
      e.preventDefault();
      onToggleFlag(idx);
    },
    [onToggleFlag],
  );

  return (
    <div
      className="grid auto-rows-min grid-cols-5 gap-1 sm:grid-cols-6 lg:grid-cols-5"
      data-testid="question-palette"
    >
      {entries.map((e) => {
        const isCurrent = e.index === currentIndex;
        const cls = isCurrent
          ? 'bg-blue-600 text-white ring-2 ring-blue-300'
          : e.flagged
            ? 'bg-yellow-300 text-yellow-900 hover:bg-yellow-200'
            : e.answered
              ? 'bg-green-200 text-green-900 hover:bg-green-100'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-100';
        return (
          <button
            key={e.index}
            type="button"
            onClick={(ev) => handleClick(ev, e.index)}
            onContextMenu={(ev) => handleContext(ev, e.index)}
            className={`relative flex h-8 w-8 items-center justify-center rounded text-xs font-medium tabular-nums transition-colors ${cls}`}
            aria-label={`Question ${e.index + 1}${e.answered ? ', answered' : ''}${e.flagged ? ', flagged' : ''}`}
          >
            {e.index + 1}
            {e.flagged && !isCurrent && (
              <Flag className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 fill-yellow-600 stroke-yellow-700" />
            )}
          </button>
        );
      })}
    </div>
  );
}
