'use client';

import { Badge, Card, CardContent, EmptyState, Skeleton } from '@examready/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useParams } from 'next/navigation';

import { AdSlot } from '@/components/ads/AdSlot';
import { ExplanationCard } from '@/components/ai/ExplanationCard';

type Result = {
  attemptId: string;
  correctCount: number;
  totalQuestions: number;
  accuracyPercent: number;
  timeSpentSeconds: number;
  submittedAt: string;
  breakdown: Array<{
    questionId: string;
    isCorrect: boolean;
    selectedOptionIds: string[] | null;
    correctOptionIds: string[];
    explanation: string;
    topicId: string;
    topicName: string;
  }>;
};

async function fetchResult(attemptId: string): Promise<Result> {
  const res = await fetch(`/api/attempts/${attemptId}`);
  if (!res.ok) throw new Error(`Result ${res.status}`);
  const json = await res.json();
  return json.data;
}

export default function ResultsPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = params.attemptId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => fetchResult(attemptId),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Couldn't load results"
        description="Refresh the page or check your connection."
      />
    );
  }

  const minutes = Math.floor(data.timeSpentSeconds / 60);
  const seconds = data.timeSpentSeconds % 60;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">Attempt complete</p>
          <h1 className="mt-1 text-3xl font-bold">
            {data.correctCount}/{data.totalQuestions}
          </h1>
          <p className="mt-1 text-lg">
            <span className="font-semibold">{data.accuracyPercent}%</span> accuracy ·{' '}
            <span className="text-muted-foreground">
              {minutes}m {seconds}s
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Free-tier ad above explanations. Tier defaults to "free" here —
          AdSlot returns null for paid tiers regardless. A future revision
          will pass real user.subscriptionTier from a session fetch so the
          slot dimensions never reserve space for paid users. */}
      <AdSlot placement="results_top" subscriptionTier="free" age={null} />

      <div className="space-y-3">
        {data.breakdown.map((b, idx) => (
          <ExplanationCard
            key={b.questionId}
            questionId={b.questionId}
            originalExplanation={b.explanation}
            className={b.isCorrect ? 'border-success/40' : 'border-destructive/40'}
            header={
              <div className="flex flex-1 items-center gap-2">
                {b.isCorrect ? (
                  <CheckCircle2 className="text-success h-5 w-5" />
                ) : (
                  <XCircle className="text-destructive h-5 w-5" />
                )}
                <span className="font-medium">Question {idx + 1}</span>
                <Badge variant="outline" className="ml-2">
                  {b.topicName}
                </Badge>
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}
