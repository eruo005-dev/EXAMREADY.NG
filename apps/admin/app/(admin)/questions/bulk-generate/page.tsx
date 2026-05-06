'use client';

/**
 * /admin/questions/bulk-generate — fan-out batch generation.
 *
 * Picks a subject, a target count per topic, and a difficulty distribution.
 * Submits to /api/admin/questions/bulk-generate which enqueues one QStash
 * worker per topic. Live progress is shown at /admin/bulk-generation-jobs.
 */
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@examready/ui';
import { Layers, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

type Exam = { id: string; name: string; slug: string; coverageStatus: string };
type Subject = { id: string; name: string; slug: string };

export default function BulkGeneratePage() {
  const { toast } = useToast();

  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [examId, setExamId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [targetCount, setTargetCount] = useState(15);
  const [easy, setEasy] = useState(5);
  const [medium, setMedium] = useState(7);
  const [hard, setHard] = useState(3);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void api<{ exams: Exam[] }>('/api/exams?include=all').then((r) => {
      if (r.ok) setExams(r.data.exams.filter((e) => e.coverageStatus !== 'hidden'));
    });
  }, []);

  useEffect(() => {
    if (!examId) {
      setSubjects([]);
      return;
    }
    void api<{ subjects: Subject[] }>(`/api/exams/${examId}/subjects`).then((r) => {
      if (r.ok) setSubjects(r.data.subjects);
    });
  }, [examId]);

  const sumOk = easy + medium + hard === targetCount;

  const submit = async () => {
    if (!subjectId) {
      toast({ variant: 'destructive', title: 'Pick a subject first' });
      return;
    }
    if (!sumOk) {
      toast({
        variant: 'destructive',
        title: 'Difficulty counts must sum to target',
        description: `Currently easy(${easy}) + medium(${medium}) + hard(${hard}) = ${easy + medium + hard}, target is ${targetCount}.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const r = await api<{
        jobId: string;
        topicsQueued: number;
        questionsExpected: number;
        monitorUrl: string;
      }>('/api/admin/questions/bulk-generate', {
        method: 'POST',
        body: JSON.stringify({
          subjectId,
          targetCountPerTopic: targetCount,
          difficultyDistribution: { easy, medium, hard },
        }),
      });

      if (r.ok) {
        toast({
          title: 'Batch queued',
          description: `${r.data.topicsQueued} topics → ~${r.data.questionsExpected} questions. Job id: ${r.data.jobId.slice(0, 8)}.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Could not queue batch',
          description: r.error.message,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Layers className="text-accent h-5 w-5" />
        <h1 className="text-2xl font-bold">Bulk question generation</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Generate N questions for every topic in a subject in one batch. Each topic becomes a
        background job; progress is at{' '}
        <Link href="/bulk-generation-jobs" className="underline">
          /bulk-generation-jobs
        </Link>
        . Generated questions land in the moderation queue at <code>/admin/questions/ai-queue</code>{' '}
        for review.
      </p>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Exam</Label>
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an exam" />
                </SelectTrigger>
                <SelectContent>
                  {exams.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} {e.coverageStatus !== 'live' && `(${e.coverageStatus})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId} disabled={!examId}>
                <SelectTrigger>
                  <SelectValue placeholder={examId ? 'Pick a subject' : 'Pick an exam first'} />
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
          </div>

          <div>
            <Label>Target questions per topic</Label>
            <Input
              type="number"
              min={5}
              max={50}
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Capped at 50/topic and ~600 total per batch. Each topic costs roughly $0.001/question
              at DeepSeek prices.
            </p>
          </div>

          <div>
            <Label>Difficulty distribution (must sum to target)</Label>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Easy (1–2)</Label>
                <Input
                  type="number"
                  min={0}
                  value={easy}
                  onChange={(e) => setEasy(Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Medium (3)</Label>
                <Input
                  type="number"
                  min={0}
                  value={medium}
                  onChange={(e) => setMedium(Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Hard (4–5)</Label>
                <Input
                  type="number"
                  min={0}
                  value={hard}
                  onChange={(e) => setHard(Number(e.target.value))}
                />
              </div>
            </div>
            <p className={`mt-1 text-xs ${sumOk ? 'text-success' : 'text-destructive'}`}>
              {easy + medium + hard} / {targetCount} {sumOk ? '✓' : '— must match target'}
            </p>
          </div>

          <Button onClick={submit} disabled={submitting || !sumOk}>
            <Sparkles className="h-4 w-4" />
            {submitting ? 'Queueing…' : 'Queue batch'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
