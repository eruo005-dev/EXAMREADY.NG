'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  RadioGroup,
  RadioGroupItem,
  useToast,
} from '@examready/ui';
import { Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';


import { AdSlot } from '@/components/ads/AdSlot';

import { Timer } from './Timer';

type QuestionPayload = {
  id: string;
  stem: string;
  passage: string | null;
  difficulty: number;
  options: Array<{ id: string; label: string; content: string }>;
};

type Props = {
  attemptId: string;
  startedAt: string;
  timeLimitSeconds?: number | null;
  questions: QuestionPayload[];
  subscriptionTier: 'free' | 'basic' | 'pro';
  age: number | null;
};

export function QuestionRunner({
  attemptId,
  startedAt,
  timeLimitSeconds,
  questions,
  subscriptionTier,
  age,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // questionId -> optionId
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const current = questions[currentIdx];
  if (!current) return null;

  const isAnswered = answers[current.id] !== undefined;

  const saveAnswer = async (optionId: string) => {
    setAnswers((prev) => ({ ...prev, [current.id]: optionId }));
    fetch(`/api/attempts/${attemptId}/answer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: current.id,
        selectedOptionIds: [optionId],
      }),
    }).catch(() => {
      // Silent — answer is in local state, will retry on submit.
    });
  };

  const toggleFlag = () => {
    const next = new Set(flagged);
    if (next.has(current.id)) next.delete(current.id);
    else next.add(current.id);
    setFlagged(next);
    fetch(`/api/attempts/${attemptId}/answer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: current.id, flagged: next.has(current.id) }),
    }).catch(() => {});
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          variant: 'destructive',
          title: 'Could not submit',
          description: data?.error?.message ?? 'Try again',
        });
        return;
      }
      router.push(`/results/${attemptId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const showAdAfterCurrent =
    subscriptionTier === 'free' && currentIdx > 0 && (currentIdx + 1) % 10 === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Question <span className="font-semibold text-foreground">{currentIdx + 1}</span> of{' '}
          {questions.length}
        </p>
        <div className="flex items-center gap-2">
          <Timer
            startedAt={new Date(startedAt)}
            limitSeconds={timeLimitSeconds ?? undefined}
            onExpire={submit}
          />
          <Button variant="ghost" size="icon" aria-label="Flag for review" onClick={toggleFlag}>
            <Flag className={flagged.has(current.id) ? 'h-4 w-4 fill-accent text-accent' : 'h-4 w-4'} />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          {current.passage && (
            <div className="rounded-md border-l-4 border-primary bg-muted/30 p-4 font-serif text-reading-base">
              {current.passage}
            </div>
          )}

          <div className="font-serif text-reading-base">
            <Badge variant="outline" className="mb-3">
              Difficulty {current.difficulty}/5
            </Badge>
            <p>{current.stem}</p>
          </div>

          <RadioGroup
            value={answers[current.id] ?? ''}
            onValueChange={(v) => saveAnswer(v)}
            className="space-y-2"
          >
            {current.options.map((o) => (
              <label
                key={o.id}
                htmlFor={o.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted"
              >
                <RadioGroupItem value={o.id} id={o.id} className="mt-0.5" />
                <span className="font-serif text-reading-base">
                  <strong className="mr-2">{o.label}.</strong>
                  {o.content}
                </span>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {showAdAfterCurrent && (
        <AdSlot
          placement="practice_interstitial"
          subscriptionTier={subscriptionTier}
          age={age}
        />
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx(currentIdx - 1)}
        >
          Previous
        </Button>
        {currentIdx < questions.length - 1 ? (
          <Button disabled={!isAnswered} onClick={() => setCurrentIdx(currentIdx + 1)}>
            Next
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit attempt'}
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Answered {Object.keys(answers).length} of {questions.length}
      </p>
    </div>
  );
}
