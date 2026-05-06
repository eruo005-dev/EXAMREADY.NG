'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@examready/ui';
import { Plus, Search, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';


import { api } from '@/lib/api';

type ListedQuestion = {
  id: string;
  stem: string;
  difficulty: number;
  year: number | null;
  source: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function QuestionsListPage() {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<ListedQuestion[] | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({ limit: '50' });
    if (search.trim()) params.set('q', search.trim());

    api<{ questions: ListedQuestion[]; nextCursor: string | null }>(
      `/api/admin/questions?${params.toString()}`,
    )
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setQuestions(r.data.questions);
        else {
          toast({ variant: 'destructive', title: 'Could not load', description: r.error.message });
          setQuestions([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [search, toast]);

  const softDelete = async (id: string) => {
    if (!confirm('Soft-delete this question? It will be hidden from practice but kept in attempt history.')) return;
    const r = await api(`/api/admin/questions/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setQuestions((prev) => (prev ? prev.filter((q) => q.id !== id) : prev));
      toast({ title: 'Deleted' });
    } else {
      toast({ variant: 'destructive', title: 'Delete failed', description: r.error.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Questions</h1>
          <p className="text-sm text-muted-foreground">
            Manage the question bank. Soft-delete only — historical attempts retain reference.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/questions/import">
              <Upload className="h-4 w-4" /> Import CSV
            </Link>
          </Button>
          <Button asChild>
            <Link href="/questions/new">
              <Plus className="h-4 w-4" /> New question
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by stem text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !questions || questions.length === 0 ? (
            <EmptyState
              title="No questions found"
              description={search ? 'Try a different search.' : 'Add your first question to get started.'}
              action={
                <Button asChild size="sm">
                  <Link href="/questions/new">New question</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {questions.map((q) => (
                <li key={q.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{q.stem}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">D{q.difficulty}</Badge>
                      {q.year && <Badge variant="outline">{q.year}</Badge>}
                      {q.source && <span className="truncate">{q.source}</span>}
                      {!q.isActive && <Badge variant="destructive">inactive</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/questions/${q.id}/edit`}>Edit</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete"
                      onClick={() => softDelete(q.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
