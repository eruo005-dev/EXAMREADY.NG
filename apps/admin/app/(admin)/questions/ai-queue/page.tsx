'use client';

import { Badge, Button, Card, CardContent, EmptyState, Skeleton, useToast } from '@examready/ui';
import { Check, Edit3, Keyboard, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const router = useRouter();
  const [pending, setPending] = useState<PendingQuestion[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const refresh = async () => {
    setPending(null);
    setFocusIdx(0);
    const r = await api<{ pending: PendingQuestion[] }>('/api/admin/questions/queue');
    if (r.ok) setPending(r.data.pending);
    else {
      toast({
        variant: 'destructive',
        title: 'Could not load queue',
        description: r.error.message,
      });
      setPending([]);
    }
  };

  useEffect(() => {
    void refresh();
    // refresh closes over `toast` which is stable across renders; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approve = useCallback(
    async (q: PendingQuestion) => {
      setBusyId(q.id);
      try {
        const r = await api(`/api/admin/questions/${q.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: true }),
        });
        if (r.ok) {
          setPending((prev) => prev?.filter((x) => x.id !== q.id) ?? null);
          // Keep focus stable: when the focused row is removed the next row
          // slides into the same index. If we were at the end, step back.
          setFocusIdx((idx) => {
            const total = (pending?.length ?? 1) - 1;
            return Math.min(idx, Math.max(0, total - 1));
          });
          toast({ title: 'Approved', description: 'Question is live.' });
        } else {
          toast({ variant: 'destructive', title: 'Approve failed', description: r.error.message });
        }
      } finally {
        setBusyId(null);
      }
    },
    [pending, toast],
  );

  const reject = useCallback(
    async (q: PendingQuestion) => {
      if (
        !confirm(
          `Reject this question? It will be permanently deleted.\n\n"${q.stem.slice(0, 80)}…"`,
        )
      )
        return;
      setBusyId(q.id);
      try {
        const r = await api(`/api/admin/questions/${q.id}/reject`, { method: 'POST' });
        if (r.ok) {
          setPending((prev) => prev?.filter((x) => x.id !== q.id) ?? null);
          setFocusIdx((idx) => {
            const total = (pending?.length ?? 1) - 1;
            return Math.min(idx, Math.max(0, total - 1));
          });
          toast({ title: 'Rejected', description: 'Question deleted from queue.' });
        } else {
          toast({ variant: 'destructive', title: 'Reject failed', description: r.error.message });
        }
      } finally {
        setBusyId(null);
      }
    },
    [pending, toast],
  );

  // Keyboard shortcuts: J/K navigate, A approve, R reject, E edit. Skip when
  // a typing element has focus so admins editing inputs aren't hijacked.
  useEffect(() => {
    if (!pending || pending.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.tagName === 'INPUT' ||
        t?.tagName === 'TEXTAREA' ||
        t?.isContentEditable ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }
      const current = pending[focusIdx];
      switch (e.key.toLowerCase()) {
        case 'j':
          e.preventDefault();
          setFocusIdx((i) => Math.min(i + 1, pending.length - 1));
          break;
        case 'k':
          e.preventDefault();
          setFocusIdx((i) => Math.max(i - 1, 0));
          break;
        case 'a':
          if (current && !busyId) {
            e.preventDefault();
            void approve(current);
          }
          break;
        case 'r':
          if (current && !busyId) {
            e.preventDefault();
            void reject(current);
          }
          break;
        case 'e':
          if (current && !busyId) {
            e.preventDefault();
            router.push(`/questions/${current.id}/edit`);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, focusIdx, busyId, approve, reject, router]);

  // Keep focused card scrolled into view as the admin J/Ks down the queue.
  useEffect(() => {
    if (!pending || pending.length === 0) return;
    const id = pending[focusIdx]?.id;
    if (!id) return;
    cardRefs.current[id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusIdx, pending]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="text-accent h-5 w-5" />
            <h1 className="text-2xl font-bold">AI question queue</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            AI-generated questions awaiting human review. Approve, edit, or reject each. Generation
            kicks off via{' '}
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

      {pending && pending.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground flex flex-wrap items-center gap-3 py-3 text-xs">
            <Keyboard className="h-3.5 w-3.5" />
            <span>
              <kbd className="rounded border px-1 font-mono">J</kbd> next ·{' '}
              <kbd className="rounded border px-1 font-mono">K</kbd> prev ·{' '}
              <kbd className="rounded border px-1 font-mono">A</kbd> approve ·{' '}
              <kbd className="rounded border px-1 font-mono">R</kbd> reject ·{' '}
              <kbd className="rounded border px-1 font-mono">E</kbd> edit
            </span>
            <span className="ml-auto">
              {focusIdx + 1} / {pending.length}
            </span>
          </CardContent>
        </Card>
      )}

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
          {pending.map((q, i) => (
            <Card
              key={q.id}
              ref={(el) => {
                cardRefs.current[q.id] = el;
              }}
              className={i === focusIdx ? 'ring-primary ring-2' : ''}
            >
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">{q.examName}</Badge>
                    <Badge variant="outline">{q.subjectName}</Badge>
                    <Badge variant="outline">{q.topicName}</Badge>
                    <Badge variant="outline">D{q.difficulty}</Badge>
                    <span className="font-mono">{q.generatedByModel}</span>
                  </div>
                </div>

                <div>
                  <p className="text-reading-base font-serif">{q.stem}</p>
                </div>

                <ul className="space-y-1">
                  {q.options.map((o) => (
                    <li
                      key={o.id}
                      className={`rounded-md border p-2 text-sm ${o.isCorrect ? 'border-success/40 bg-success/5' : ''}`}
                    >
                      <span className="font-bold">{o.label}.</span> {o.content}
                      {o.isCorrect && (
                        <span className="text-success ml-2 text-xs font-medium">CORRECT</span>
                      )}
                    </li>
                  ))}
                </ul>

                <details className="bg-muted/30 rounded-md border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Show explanation</summary>
                  <p className="text-muted-foreground mt-2 whitespace-pre-wrap">{q.explanation}</p>
                </details>

                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button size="sm" onClick={() => approve(q)} disabled={busyId === q.id}>
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
