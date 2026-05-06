'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
  useToast,
} from '@examready/ui';
import { Check, Edit3, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';


import { api } from '@/lib/api';

type PendingOption = {
  id: string;
  label: string;
  content: string;
  isCorrect: boolean;
  sortOrder: number;
};

type PendingQuestion = {
  id: string;
  stem: string;
  explanation: string;
  difficulty: number;
  generatedByModel: string;
  createdAt: string;
  examName: string;
  subjectName: string;
  topicName: string;
  topicId: string;
  options: PendingOption[];
};

export default function AiQueuePage() {
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingQuestion[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setPending(null);
    const r = await api<{ pending: PendingQuestion[] }>('/api/admin/questions/queue');
    if (r.ok) setPending(r.data.pending);
    else {
      toast({ variant: 'destructive', title: 'Could not load queue', description: r.error.message });
      setPending([]);
    }
  };

  useEffect(() => {
    void refresh();
    // refresh closes over `toast` which is stable across renders; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approve = async (q: PendingQuestion) => {
    setBusyId(q.id);
    try {
      const r = await api(`/api/admin/questions/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: true }),
      });
      if (r.ok) {
        setPending((prev) => prev?.filter((x) => x.id !== q.id) ?? null);
        toast({ title: 'Approved', description: 'Question is live.' });
      } else {
        toast({ variant: 'destructive', title: 'Approve failed', description: r.error.message });
      }
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (q: PendingQuestion) => {
    if (!confirm(`Reject this question? It will be permanently deleted.\n\n"${q.stem.slice(0, 80)}…"`)) return;
    setBusyId(q.id);
    try {
      const r = await api(`/api/admin/questions/${q.id}/reject`, { method: 'POST' });
      if (r.ok) {
        setPending((prev) => prev?.filter((x) => x.id !== q.id) ?? null);
        toast({ title: 'Rejected', description: 'Question deleted from queue.' });
      } else {
        toast({ variant: 'destructive', title: 'Reject failed', description: r.error.message });
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <h1 className="text-2xl font-bold">AI question queue</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            AI-generated questions awaiting human review. Approve, edit, or reject each.
            Generation kicks off via{' '}
            <Link href="/questions" className="underline">
              Questions → Generate with AI
            </Link>{' '}
            (admin tool, runs against Claude API; cost is borne by the platform).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      {pending === null ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <EmptyState
          title="No questions in the queue"
          description="Generate a batch from the Questions page to populate the queue."
        />
      ) : (
        <div className="space-y-4">
          {pending.map((q) => (
            <Card key={q.id}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{q.examName}</Badge>
                    <Badge variant="outline">{q.subjectName}</Badge>
                    <Badge variant="outline">{q.topicName}</Badge>
                    <Badge variant="outline">D{q.difficulty}</Badge>
                    <span className="font-mono">{q.generatedByModel}</span>
                  </div>
                </div>

                <div>
                  <p className="font-serif text-reading-base">{q.stem}</p>
                </div>

                <ul className="space-y-1">
                  {q.options.map((o) => (
                    <li
                      key={o.id}
                      className={`rounded-md border p-2 text-sm ${o.isCorrect ? 'border-success/40 bg-success/5' : ''}`}
                    >
                      <span className="font-bold">{o.label}.</span> {o.content}
                      {o.isCorrect && <span className="ml-2 text-xs font-medium text-success">CORRECT</span>}
                    </li>
                  ))}
                </ul>

                <details className="rounded-md border bg-muted/30 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Show explanation</summary>
                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{q.explanation}</p>
                </details>

                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    onClick={() => approve(q)}
                    disabled={busyId === q.id}
                  >
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/questions/${q.id}/edit`}>
                      <Edit3 className="h-4 w-4" /> Edit
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => reject(q)}
                    disabled={busyId === q.id}
                  >
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
