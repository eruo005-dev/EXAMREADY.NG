'use client';

import {
  Button,
  Card,
  CardContent,
  RadioGroup,
  RadioGroupItem,
  useToast,
} from '@examready/ui';
import { useState } from 'react';


import { QuestionRunner } from '@/components/practice/QuestionRunner';

type Mode = 'quick_practice' | 'topic_drill' | 'past_year' | 'mock_cbt' | 'adaptive';
type Question = Parameters<typeof QuestionRunner>[0]['questions'][number];

type AttemptResponse = {
  attemptId: string;
  startedAt: string;
  questions: Question[];
};

export function PracticeStarter({
  examId,
  examName,
  subscriptionTier,
  age,
}: {
  examId: string;
  examName: string;
  subscriptionTier: 'free' | 'basic' | 'pro';
  age: number | null;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('quick_practice');
  const [count, setCount] = useState(10);
  const [starting, setStarting] = useState(false);
  const [attempt, setAttempt] = useState<AttemptResponse | null>(null);

  const start = async () => {
    setStarting(true);
    try {
      const qRes = await fetch(
        `/api/questions/practice?examId=${examId}&mode=${mode}&count=${count}`,
      );
      const qData = await qRes.json();
      if (!qRes.ok) {
        toast({ variant: 'destructive', title: 'Could not load questions', description: qData?.error?.message });
        return;
      }
      const questions: Array<{ id: string }> = qData.data.questions;
      if (questions.length === 0) {
        toast({ variant: 'destructive', title: 'No questions available', description: 'Try a different mode or count.' });
        return;
      }

      const aRes = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          examId,
          questionIds: questions.map((q) => q.id),
          timeLimitSeconds: mode === 'mock_cbt' ? count * 60 : undefined,
        }),
      });
      const aData = await aRes.json();
      if (!aRes.ok) {
        toast({
          variant: 'destructive',
          title:
            aData?.error?.code === 'TIER_LIMIT_EXCEEDED'
              ? 'Free-tier limit reached'
              : 'Could not start attempt',
          description: aData?.error?.message,
        });
        return;
      }
      setAttempt(aData.data);
    } finally {
      setStarting(false);
    }
  };

  if (attempt) {
    return (
      <QuestionRunner
        attemptId={attempt.attemptId}
        startedAt={attempt.startedAt}
        timeLimitSeconds={mode === 'mock_cbt' ? count * 60 : null}
        questions={attempt.questions}
        subscriptionTier={subscriptionTier}
        age={age}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{examName}</h1>
        <p className="text-sm text-muted-foreground">Pick a mode and number of questions to start.</p>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div>
            <p className="mb-2 font-semibold">Practice mode</p>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-2">
              {[
                { v: 'quick_practice', l: 'Quick Practice', d: 'Random questions, no time limit.' },
                { v: 'mock_cbt', l: 'Mock CBT', d: 'Timed full simulation. Free tier: 1 per 7 days.' },
                { v: 'past_year', l: 'Past Years', d: 'Real questions from a specific year.' },
                { v: 'topic_drill', l: 'Topic Drill', d: 'Focus on your weak topics.' },
                { v: 'adaptive', l: 'Adaptive', d: 'Difficulty adjusts to you.' },
              ].map(({ v, l, d }) => (
                <label key={v} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted">
                  <RadioGroupItem value={v} id={`mode-${v}`} className="mt-0.5" />
                  <div>
                    <p className="font-medium">{l}</p>
                    <p className="text-xs text-muted-foreground">{d}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <p className="mb-2 font-semibold">How many questions?</p>
            <div className="flex gap-2">
              {[10, 20, 40].map((n) => (
                <Button
                  key={n}
                  variant={count === n ? 'default' : 'outline'}
                  onClick={() => setCount(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>

          <Button onClick={start} disabled={starting} className="w-full" size="lg">
            {starting ? 'Loading questions…' : `Start ${count}-question practice`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
