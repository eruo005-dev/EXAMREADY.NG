/**
 * JAMB-style calculator widget.
 *
 * JAMB allows a basic 4-function + memory + sqrt + percent calculator
 * on the in-exam UI; advanced functions (sin/cos/log) are NOT permitted.
 * This widget mirrors that exactly so candidates practising on
 * ExamReady don't develop habits that won't transfer.
 *
 * Shape:
 *   - Floating panel, draggable by the title bar.
 *   - Toggle from the CBT runner via the K key (avoids 'C' which is
 *     the option-C answer key).
 *   - Pure React state — no external library dependency.
 *
 * Math semantics:
 *   - JAMB calculator is an immediate-execute calculator (not RPN).
 *     Pressing "5 + 3 =" returns 8. Pressing "5 + 3 + 2 =" returns 10.
 *     We chain: each operator key first applies the pending op.
 *   - Division by zero shows "Error" and clears state.
 *   - Square-root operates on the current display value immediately.
 *   - Percent (`%`) divides display by 100.
 *   - Memory: M+, M-, MR, MC. Single accumulator (MR returns it).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Operator = '+' | '-' | '×' | '÷' | null;

interface CalcState {
  display: string;
  pending: number | null;
  operator: Operator;
  /** Set after pressing a digit AFTER an operator — replace mode is off. */
  freshDigit: boolean;
  memory: number;
  errored: boolean;
}

const initialState: CalcState = {
  display: '0',
  pending: null,
  operator: null,
  freshDigit: true,
  memory: 0,
  errored: false,
};

function format(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  // JAMB calc shows up to ~9 digits; trim trailing zeros from decimals.
  const s = n.toString();
  if (s.length > 12) return n.toExponential(6);
  return s;
}

function applyOp(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      if (b === 0) return Number.NaN;
      return a / b;
    case null:
      return b;
  }
}

interface Props {
  /** When false the panel is hidden (keyboard 'K' toggles in CbtRunner). */
  open: boolean;
  onClose(): void;
}

export function JambCalculator({ open, onClose }: Props) {
  const [state, setState] = useState<CalcState>(initialState);
  const [pos, setPos] = useState({ x: 80, y: 120 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const inputDigit = useCallback((d: string) => {
    setState((s) => {
      if (s.errored) return { ...initialState, display: d };
      if (s.freshDigit) return { ...s, display: d, freshDigit: false };
      if (s.display.length >= 12) return s;
      return { ...s, display: s.display === '0' ? d : s.display + d };
    });
  }, []);

  const inputDot = useCallback(() => {
    setState((s) => {
      if (s.errored) return { ...initialState, display: '0.', freshDigit: false };
      if (s.freshDigit) return { ...s, display: '0.', freshDigit: false };
      if (s.display.includes('.')) return s;
      return { ...s, display: s.display + '.' };
    });
  }, []);

  const inputOp = useCallback((op: Operator) => {
    setState((s) => {
      if (s.errored) return s;
      const current = parseFloat(s.display);
      const accumulated = s.pending == null ? current : applyOp(s.pending, current, s.operator);
      if (!Number.isFinite(accumulated)) {
        return { ...initialState, display: 'Error', errored: true };
      }
      return {
        ...s,
        pending: accumulated,
        operator: op,
        display: format(accumulated),
        freshDigit: true,
      };
    });
  }, []);

  const equals = useCallback(() => {
    setState((s) => {
      if (s.errored || s.operator == null || s.pending == null) return s;
      const current = parseFloat(s.display);
      const result = applyOp(s.pending, current, s.operator);
      if (!Number.isFinite(result)) return { ...initialState, display: 'Error', errored: true };
      return { ...s, pending: null, operator: null, display: format(result), freshDigit: true };
    });
  }, []);

  const sqrt = useCallback(() => {
    setState((s) => {
      if (s.errored) return s;
      const v = parseFloat(s.display);
      if (v < 0) return { ...initialState, display: 'Error', errored: true };
      return { ...s, display: format(Math.sqrt(v)), freshDigit: true };
    });
  }, []);

  const percent = useCallback(() => {
    setState((s) => {
      if (s.errored) return s;
      const v = parseFloat(s.display);
      return { ...s, display: format(v / 100), freshDigit: true };
    });
  }, []);

  const sign = useCallback(() => {
    setState((s) => {
      if (s.errored) return s;
      const v = parseFloat(s.display);
      return { ...s, display: format(-v) };
    });
  }, []);

  const clear = useCallback(() => setState(initialState), []);

  const memoryAdd = useCallback(() => {
    setState((s) => ({ ...s, memory: s.memory + parseFloat(s.display) }));
  }, []);
  const memorySub = useCallback(() => {
    setState((s) => ({ ...s, memory: s.memory - parseFloat(s.display) }));
  }, []);
  const memoryRecall = useCallback(() => {
    setState((s) => ({ ...s, display: format(s.memory), freshDigit: true }));
  }, []);
  const memoryClear = useCallback(() => {
    setState((s) => ({ ...s, memory: 0 }));
  }, []);

  // Local keyboard shortcuts ONLY when the calculator is open and
  // focused. The CBT runner's global handler ignores key events when
  // a button inside the calculator panel has focus (data-cbt-calc).
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      // Only respond when focus is in our panel — prevents stealing
      // the option keys from the question.
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.('[data-cbt-calc="root"]')) return;
      if (e.key >= '0' && e.key <= '9') inputDigit(e.key);
      else if (e.key === '.') inputDot();
      else if (e.key === '+') inputOp('+');
      else if (e.key === '-') inputOp('-');
      else if (e.key === '*') inputOp('×');
      else if (e.key === '/') inputOp('÷');
      else if (e.key === 'Enter' || e.key === '=') equals();
      else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Backspace') {
        // Backspace = clear last digit
        setState((s) => {
          if (s.errored || s.freshDigit) return s;
          const next = s.display.length <= 1 ? '0' : s.display.slice(0, -1);
          return { ...s, display: next };
        });
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, inputDigit, inputDot, inputOp, equals, onClose]);

  if (!open) return null;

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({ x: ev.clientX - dragRef.current.dx, y: ev.clientY - dragRef.current.dy });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Layout: 5 cols × 5 rows. Top row dedicated to memory + clear.
  return (
    <div
      data-cbt-calc="root"
      className="fixed z-50 w-64 select-none rounded-lg border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onMouseDown={onDragStart}
        className="cursor-move rounded-t-lg border-b border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium"
      >
        Calculator <span className="float-right opacity-60">drag · K to close</span>
      </div>
      <div className="bg-slate-950 px-3 py-2 text-right font-mono text-2xl tabular-nums">
        {state.display}
      </div>
      <div className="grid grid-cols-5 gap-px bg-slate-700">
        <CalcKey label="MC" onClick={memoryClear} />
        <CalcKey label="MR" onClick={memoryRecall} />
        <CalcKey label="M+" onClick={memoryAdd} />
        <CalcKey label="M-" onClick={memorySub} />
        <CalcKey label="C" onClick={clear} variant="red" />

        <CalcKey label="√" onClick={sqrt} />
        <CalcKey label="%" onClick={percent} />
        <CalcKey label="±" onClick={sign} />
        <CalcKey label="÷" onClick={() => inputOp('÷')} variant="op" />
        <CalcKey label="×" onClick={() => inputOp('×')} variant="op" />

        <CalcKey label="7" onClick={() => inputDigit('7')} />
        <CalcKey label="8" onClick={() => inputDigit('8')} />
        <CalcKey label="9" onClick={() => inputDigit('9')} />
        <CalcKey label="-" onClick={() => inputOp('-')} variant="op" />
        <CalcKey label="+" onClick={() => inputOp('+')} variant="op" />

        <CalcKey label="4" onClick={() => inputDigit('4')} />
        <CalcKey label="5" onClick={() => inputDigit('5')} />
        <CalcKey label="6" onClick={() => inputDigit('6')} />
        <CalcKey label="1" onClick={() => inputDigit('1')} />
        <CalcKey label="2" onClick={() => inputDigit('2')} />

        <CalcKey label="3" onClick={() => inputDigit('3')} />
        <CalcKey label="0" onClick={() => inputDigit('0')} />
        <CalcKey label="." onClick={inputDot} />
        <CalcKey label="=" onClick={equals} variant="green" colSpan={2} />
      </div>
    </div>
  );
}

function CalcKey({
  label,
  onClick,
  variant,
  colSpan,
}: {
  label: string;
  onClick: () => void;
  variant?: 'op' | 'green' | 'red';
  colSpan?: number;
}) {
  const bg =
    variant === 'op'
      ? 'bg-slate-700 hover:bg-slate-600'
      : variant === 'green'
        ? 'bg-green-700 hover:bg-green-600'
        : variant === 'red'
          ? 'bg-red-700 hover:bg-red-600'
          : 'bg-slate-800 hover:bg-slate-700';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${bg} px-2 py-2 text-sm font-medium tabular-nums ${colSpan === 2 ? 'col-span-2' : ''}`}
    >
      {label}
    </button>
  );
}
