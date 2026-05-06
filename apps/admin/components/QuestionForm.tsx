'use client';

import {
  Button,
  Card,
  CardContent,
  Checkbox,
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
import { useEffect, useState } from 'react';


import { api } from '@/lib/api';

export type QuestionFormValue = {
  examId: string;
  subjectId: string;
  topicId: string;
  questionType: 'mcq_single' | 'mcq_multi' | 'true_false' | 'fill_blank' | 'theory' | 'comprehension' | 'diagram';
  stem: string;
  passage: string;
  difficulty: number;
  year: string;
  source: string;
  explanation: string;
  isActive: boolean;
  options: Array<{ label: string; content: string; isCorrect: boolean }>;
};

export const emptyQuestionForm = (): QuestionFormValue => ({
  examId: '',
  subjectId: '',
  topicId: '',
  questionType: 'mcq_single',
  stem: '',
  passage: '',
  difficulty: 3,
  year: '',
  source: '',
  explanation: '',
  isActive: true,
  options: [
    { label: 'A', content: '', isCorrect: false },
    { label: 'B', content: '', isCorrect: false },
    { label: 'C', content: '', isCorrect: false },
    { label: 'D', content: '', isCorrect: false },
  ],
});

type Exam = { id: string; name: string; slug: string };
type Subject = { id: string; name: string; slug: string };
type Topic = { id: string; name: string; slug: string; children: Topic[] };

export type QuestionFormProps = {
  initial?: QuestionFormValue;
  onSubmit: (value: QuestionFormValue) => Promise<void>;
  submitLabel: string;
};

export function QuestionForm({ initial, onSubmit, submitLabel }: QuestionFormProps) {
  const { toast } = useToast();
  const [value, setValue] = useState<QuestionFormValue>(initial ?? emptyQuestionForm());
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<{ exams: Exam[] }>('/api/exams').then((r) => {
      if (r.ok) setExams(r.data.exams);
    });
  }, []);

  useEffect(() => {
    if (!value.examId) {
      setSubjects([]);
      return;
    }
    api<{ subjects: Subject[] }>(`/api/exams/${value.examId}/subjects`).then((r) => {
      if (r.ok) setSubjects(r.data.subjects);
    });
  }, [value.examId]);

  useEffect(() => {
    if (!value.subjectId) {
      setTopics([]);
      return;
    }
    api<{ topics: Topic[] }>(`/api/subjects/${value.subjectId}/topics`).then((r) => {
      if (r.ok) setTopics(flattenTopics(r.data.topics));
    });
  }, [value.subjectId]);

  const flattenTopics = (tree: Topic[]): Topic[] => {
    const result: Topic[] = [];
    const walk = (nodes: Topic[]) => {
      for (const n of nodes) {
        result.push(n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(tree);
    return result;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.options.some((o) => o.isCorrect)) {
      toast({ variant: 'destructive', title: 'Mark a correct answer', description: 'At least one option must be marked correct.' });
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(value);
    } finally {
      setSubmitting(false);
    }
  };

  const setOption = (idx: number, patch: Partial<{ content: string; isCorrect: boolean }>) => {
    setValue((v) => ({
      ...v,
      options: v.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    }));
  };

  // For mcq_single, only one option can be correct.
  const setCorrectSingle = (idx: number) => {
    setValue((v) => ({
      ...v,
      options: v.options.map((o, i) => ({ ...o, isCorrect: i === idx })),
    }));
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="exam">Exam</Label>
              <Select value={value.examId} onValueChange={(v) => setValue({ ...value, examId: v, subjectId: '', topicId: '' })}>
                <SelectTrigger id="exam"><SelectValue placeholder="Pick exam" /></SelectTrigger>
                <SelectContent>
                  {exams.map((e) => (<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Select value={value.subjectId} onValueChange={(v) => setValue({ ...value, subjectId: v, topicId: '' })} disabled={!value.examId}>
                <SelectTrigger id="subject"><SelectValue placeholder="Pick subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Select value={value.topicId} onValueChange={(v) => setValue({ ...value, topicId: v })} disabled={!value.subjectId}>
                <SelectTrigger id="topic"><SelectValue placeholder="Pick topic" /></SelectTrigger>
                <SelectContent>
                  {topics.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="qtype">Type</Label>
              <Select
                value={value.questionType}
                onValueChange={(v) => setValue({ ...value, questionType: v as QuestionFormValue['questionType'] })}
              >
                <SelectTrigger id="qtype"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq_single">Single answer (MCQ)</SelectItem>
                  <SelectItem value="mcq_multi">Multi answer (MCQ)</SelectItem>
                  <SelectItem value="comprehension">Comprehension (with passage)</SelectItem>
                  <SelectItem value="true_false">True / False</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="difficulty">Difficulty (1–5)</Label>
              <Input
                id="difficulty"
                type="number"
                min={1}
                max={5}
                value={value.difficulty}
                onChange={(e) => setValue({ ...value, difficulty: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year (optional)</Label>
              <Input
                id="year"
                type="number"
                placeholder="2023"
                value={value.year}
                onChange={(e) => setValue({ ...value, year: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Source (optional)</Label>
            <Input
              id="source"
              placeholder="e.g. JAMB 2023 Paper 1"
              value={value.source}
              onChange={(e) => setValue({ ...value, source: e.target.value })}
            />
          </div>

          {value.questionType === 'comprehension' && (
            <div className="space-y-2">
              <Label htmlFor="passage">Passage</Label>
              <textarea
                id="passage"
                className="min-h-[120px] w-full rounded-md border border-input bg-background p-3 text-sm"
                value={value.passage}
                onChange={(e) => setValue({ ...value, passage: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="stem">Question stem</Label>
            <textarea
              id="stem"
              className="min-h-[100px] w-full rounded-md border border-input bg-background p-3 text-sm"
              required
              value={value.stem}
              onChange={(e) => setValue({ ...value, stem: e.target.value })}
            />
          </div>

          <div className="space-y-3">
            <Label>Options</Label>
            {value.questionType === 'mcq_single' ? (
              <RadioGroup
                value={String(value.options.findIndex((o) => o.isCorrect))}
                onValueChange={(v) => setCorrectSingle(parseInt(v, 10))}
              >
                {value.options.map((o, i) => (
                  <div key={o.label} className="flex items-start gap-3 rounded-md border p-3">
                    <RadioGroupItem value={String(i)} id={`opt-${i}`} className="mt-2" />
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`opt-${i}`} className="font-bold">{o.label}</Label>
                      <Input
                        value={o.content}
                        onChange={(e) => setOption(i, { content: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <div className="space-y-2">
                {value.options.map((o, i) => (
                  <div key={o.label} className="flex items-start gap-3 rounded-md border p-3">
                    <Checkbox
                      checked={o.isCorrect}
                      onCheckedChange={(v) => setOption(i, { isCorrect: v === true })}
                      className="mt-2"
                    />
                    <div className="flex-1 space-y-1">
                      <Label className="font-bold">{o.label}</Label>
                      <Input
                        value={o.content}
                        onChange={(e) => setOption(i, { content: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="explanation">Explanation (3–5 sentences)</Label>
            <textarea
              id="explanation"
              className="min-h-[120px] w-full rounded-md border border-input bg-background p-3 text-sm"
              required
              value={value.explanation}
              onChange={(e) => setValue({ ...value, explanation: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Detailed explanations are our differentiator. Don&apos;t skimp.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.isActive}
              onCheckedChange={(v) => setValue({ ...value, isActive: v === true })}
            />
            Active (visible to students)
          </label>
        </CardContent>
      </Card>

      <Button type="submit" disabled={submitting} size="lg" className="w-full md:w-auto">
        {submitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
