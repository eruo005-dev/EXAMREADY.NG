/**
 * Thin client wrapper around the CBT runner. Owns the wire to the
 * existing /api/attempts/[attemptId]/answer + /submit endpoints.
 *
 * The runner doesn't import fetch directly — having all network calls
 * concentrated here keeps the runner pure and unit-testable with mocks.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { CbtRunner, type CbtAttemptInfo, type CbtQuestion } from '@/components/cbt/CbtRunner';

interface Props {
  attempt: CbtAttemptInfo;
  questions: CbtQuestion[];
  initialAnswers: Record<string, string | null>;
  initialFlags: Record<string, boolean>;
}

export function CbtPageClient({ attempt, questions, initialAnswers, initialFlags }: Props) {
  const router = useRouter();

  const onAnswer = useCallback(
    async (questionId: string, optionId: string | null) => {
      // Best-effort POST. Server may also reject if the attempt is
      // closed; the client doesn't surface that error mid-exam — the
      // submit flow is the canonical commit point.
      await fetch(`/api/attempts/${attempt.id}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId, selectedOptionId: optionId }),
      }).catch(() => undefined);
    },
    [attempt.id],
  );

  const onFlag = useCallback(
    async (questionId: string, flagged: boolean) => {
      await fetch(`/api/attempts/${attempt.id}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId, flagged }),
      }).catch(() => undefined);
    },
    [attempt.id],
  );

  const onSubmit = useCallback(async () => {
    const res = await fetch(`/api/attempts/${attempt.id}/submit`, { method: 'POST' });
    if (res.ok) {
      router.push(`/results/${attempt.id}`);
    } else {
      // On failure, surface generic alert. Submit is rare enough that
      // a hard reload-and-retry path is acceptable; we don't want to
      // silently swallow a server-side scoring error.
      alert('Submission failed. Please retry — your answers are saved.');
    }
  }, [attempt.id, router]);

  return (
    <CbtRunner
      attempt={attempt}
      questions={questions}
      initialAnswers={initialAnswers}
      initialFlags={initialFlags}
      onAnswer={onAnswer}
      onFlag={onFlag}
      onSubmit={onSubmit}
    />
  );
}
