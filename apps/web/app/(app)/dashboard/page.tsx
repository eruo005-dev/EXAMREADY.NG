'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
} from '@examready/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Flame, Target, Trophy } from 'lucide-react';
import Link from 'next/link';

import { AdSlot } from '@/components/ads/AdSlot';

type Dashboard = {
  user: {
    id: string;
    fullName: string | null;
    subscriptionTier: 'free' | 'basic' | 'pro';
    streakDays: number;
    readyPointsBalance: number;
  };
  targetExams: Array<{ examId: string; examName: string; examDate: string | null; daysUntil: number | null }>;
  stats30d: {
    questionsAnswered: number;
    accuracyPercent: number;
    studyTimeSeconds: number;
    attemptsCount: number;
  };
  weakTopics: Array<{ topicId: string; topicName: string; subjectName: string; accuracyPercent: number; attempts: number }>;
  recentAttempts: Array<{
    attemptId: string;
    mode: string;
    examName: string;
    correctCount: number;
    totalQuestions: number;
    submittedAt: string;
  }>;
  inProgressAttempt: { attemptId: string; mode: string; questionsRemaining: number; startedAt: string } | null;
};

async function fetchDashboard(): Promise<Dashboard> {
  const res = await fetch('/api/me/dashboard');
  if (!res.ok) throw new Error(`Dashboard ${res.status}`);
  const json = await res.json();
  return json.data;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <EmptyState
        title="Couldn't load your dashboard"
        description="Check your connection and try refreshing the page."
      />
    );
  }

  const greeting = data.user.fullName?.split(' ')[0] ?? 'there';
  const isFree = data.user.subscriptionTier === 'free';

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Hey {greeting} 👋</h1>
          <p className="text-sm text-muted-foreground">Pick up where you left off.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="outline" className="gap-1">
            <Flame className="h-3.5 w-3.5 text-accent" />
            {data.user.streakDays}-day streak
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Trophy className="h-3.5 w-3.5 text-accent" />
            {data.user.readyPointsBalance} pts
          </Badge>
        </div>
      </div>

      {data.inProgressAttempt && (
        <Card className="border-primary">
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-sm font-medium">Continue where you left off</p>
              <p className="text-xs text-muted-foreground">
                {data.inProgressAttempt.questionsRemaining} questions remaining
              </p>
            </div>
            <Button asChild size="sm">
              <Link href={`/practice/${data.inProgressAttempt.attemptId}`}>
                Resume <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Questions (30d)" value={data.stats30d.questionsAnswered} />
        <StatCard label="Accuracy (30d)" value={`${data.stats30d.accuracyPercent}%`} />
        <StatCard label="Study time (30d)" value={formatDuration(data.stats30d.studyTimeSeconds)} />
        <StatCard label="Attempts (30d)" value={data.stats30d.attemptsCount} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-semibold">Your exams</p>
              </div>
              {data.targetExams.length === 0 ? (
                <EmptyState
                  icon={Target}
                  title="No exams set"
                  description="Add an exam to start tracking your countdown."
                  action={
                    <Button asChild size="sm">
                      <Link href="/settings">Add exam</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {data.targetExams.map((e) => (
                    <li key={e.examId} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{e.examName}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.examDate ? `${e.examDate}` : 'Date not set'}
                        </p>
                      </div>
                      {e.daysUntil !== null && (
                        <Badge variant={e.daysUntil <= 30 ? 'warning' : 'outline'}>
                          {e.daysUntil > 0 ? `${e.daysUntil} days left` : 'Today!'}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="mb-4 font-semibold">Weak topics</p>
              {data.weakTopics.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No data yet"
                  description="Complete a few practice attempts to see where to focus."
                />
              ) : (
                <ul className="space-y-2">
                  {data.weakTopics.map((t) => (
                    <li key={t.topicId} className="flex items-center justify-between rounded-md p-2 hover:bg-muted">
                      <div>
                        <p className="font-medium">{t.topicName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.subjectName} · {t.attempts} attempts
                        </p>
                      </div>
                      <Badge variant={t.accuracyPercent < 50 ? 'destructive' : 'warning'}>
                        {t.accuracyPercent}%
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Sidebar AdSlot — free tier only */}
          {isFree && (
            <AdSlot
              slotId={process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD_SIDEBAR ?? '0000000000'}
              placement="dashboard_sidebar"
              subscriptionTier={data.user.subscriptionTier}
              age={null}
              width={300}
              height={250}
            />
          )}

          <Card>
            <CardContent className="pt-6">
              <p className="mb-4 font-semibold">Recent attempts</p>
              {data.recentAttempts.length === 0 ? (
                <EmptyState title="No attempts yet" description="Start with a quick 10-question warm-up." />
              ) : (
                <ul className="space-y-2">
                  {data.recentAttempts.map((a) => (
                    <li key={a.attemptId}>
                      <Link
                        href={`/results/${a.attemptId}`}
                        className="block rounded-md p-2 hover:bg-muted"
                      >
                        <p className="text-sm font-medium">{a.examName}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.correctCount}/{a.totalQuestions} ·{' '}
                          {Math.round((a.correctCount / a.totalQuestions) * 100)}%
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
