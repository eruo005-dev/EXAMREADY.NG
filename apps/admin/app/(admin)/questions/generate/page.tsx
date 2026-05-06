'use client';

import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@examready/ui';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';


import { api } from '@/lib/api';

type Exam = { id: string; name: string; slug: string };
type Subject = { id: string; name: string; slug: string };
type Topic = { id: string; name: string; slug: string; children: Topic[] };

export default function GenerateQuestionsPage() {
  const { toast } = useToast();

  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);

  const [examId, setExamId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [count, setCount] = useState(10);
  const [difficultyHint, setDifficultyHint] = useState<'easier' | 'harder' | 'mixed'>('mixed');

  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    generated: number;
    topic: string;
  } | null>(null);

  useEffect(() => {
    api<{ exams: Exam[] }>('/api/exams?include=all').then((r) => {
      if (r.ok) setExams(r.data.exams);
    });
  }, []);

  useEffect(() => {
    if (!examId) return;
    api<{ subjects: Subject[] }>(`/api/exams/${examId}/subjects`).then((r) => {
      if (r.ok) setSubjects(r.data.subjects);
    });
  }, [examId]);

  useEffect(() => {
    if (!subjectId) return;
    api<{ topics: Topic[] }>(`/api/subjects/${subjectId}/topics`).then((r) => {
      if (!r.ok) return;
      const flat: Topic[] = [];
      const walk = (nodes: Topic[]) => {
        for (const n of nodes) {
          flat.push(n);
          if (n.children?.length) walk(n.children);
        }
      };
      walk(r.data.topics);
      setTopics(flat);
    });
  }, [subjectId]);

  const submit = async () => {
    if (!topicId) {
      toast({ variant: 'destructive', title: 'Pick a topic first' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<{ generated: number; topic: string }>(
        '/api/admin/questions/generate-with-ai',
        {
          method: 'POST',
          body: JSON.stringify({ topicId, count, difficultyHint }),
        },
      );
      if (r.ok) {
        setLastResult(r.data);
        toast({
          title: `Generated ${r.data.generated} questions`,
          description: `Review them at /admin/questions/ai-queue.`,
        });
      } else {
        toast({ variant: 'destructive', title: 'Generation failed', description: r.error.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <h1 className="text-2xl font-bold">Generate questions with AI</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Drafts a batch of questions for one topic via Claude. Generated questions enter
          the moderation queue (is_active=false) for human review at{' '}
          <Link href="/questions/ai-queue" className="underline">
            /admin/questions/ai-queue
          </Link>
          . Cost is platform-borne; aim for batches of 5–15 at a time.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="exam">Exam</Label>
              <Select
                value={examId}
                onValueChange={(v) => {
                  setExamId(v);
                  setSubjectId('');
                  setTopicId('');
                }}
              >
                <SelectTrigger id="exam">
                  <SelectValue placeholder="Pick exam" />
                </SelectTrigger>
                <SelectContent>
                  {exams.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Select
                value={subjectId}
                onValueChange={(v) => {
                  setSubjectId(v);
                  setTopicId('');
                }}
                disabled={!examId}
              >
                <SelectTrigger id="subject">
                  <SelectValue placeholder="Pick subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Select value={topicId} onValueChange={setTopicId} disabled={!subjectId}>
                <SelectTrigger id="topic">
                  <SelectValue placeholder="Pick topic" />
                </SelectTrigger>
                <SelectContent>
                  {topics.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="count">How many questions?</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={15}
              value={count}
              onChange={(e) => setCount(Math.min(15, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            />
            <p className="text-xs text-muted-foreground">
              1–15 per batch. Larger batches share less attention per question — quality drops.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Difficulty distribution</Label>
            <RadioGroup
              value={difficultyHint}
              onValueChange={(v) => setDifficultyHint(v as typeof difficultyHint)}
              className="space-y-2"
            >
              {[
                { v: 'mixed', l: 'Mixed', d: 'Bulk of difficulty 2–4 with a few 1s and 5s.' },
                { v: 'easier', l: 'Easier', d: 'Skew towards difficulty 1–2.' },
                { v: 'harder', l: 'Harder', d: 'Skew towards difficulty 4–5.' },
              ].map(({ v, l, d }) => (
                <label
                  key={v}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted"
                >
                  <RadioGroupItem value={v} id={`diff-${v}`} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{l}</p>
                    <p className="text-xs text-muted-foreground">{d}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </div>

          <Button onClick={submit} disabled={submitting || !topicId} className="w-full">
            {submitting ? 'Generating (this can take 30–60 seconds)…' : `Generate ${count} questions`}
          </Button>
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="border-success/40">
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">
              Last batch: {lastResult.generated} questions on {lastResult.topic}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/questions/ai-queue">Review in queue →</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
