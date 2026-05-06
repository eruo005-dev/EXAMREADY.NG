'use client';

import { Skeleton, useToast } from '@examready/ui';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';


import {
  QuestionForm,
  emptyQuestionForm,
  type QuestionFormValue,
} from '@/components/QuestionForm';
import { api } from '@/lib/api';

import { formValueToCreatePayload } from '../../new/page';

type FetchedQuestion = {
  question: {
    id: string;
    examId: string;
    subjectId: string;
    topicId: string;
    questionType: QuestionFormValue['questionType'];
    stem: string;
    passage: string | null;
    difficulty: number;
    year: number | null;
    source: string | null;
    explanation: string;
    isActive: boolean;
  };
  options: Array<{ id: string; label: string; content: string; isCorrect: boolean; sortOrder: number }>;
};

export default function EditQuestionPage() {
  const params = useParams<{ questionId: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [initial, setInitial] = useState<QuestionFormValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<FetchedQuestion>(`/api/admin/questions/${params.questionId}`).then((r) => {
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      const { question, options } = r.data;
      const form = emptyQuestionForm();
      form.examId = question.examId;
      form.subjectId = question.subjectId;
      form.topicId = question.topicId;
      form.questionType = question.questionType;
      form.stem = question.stem;
      form.passage = question.passage ?? '';
      form.difficulty = question.difficulty;
      form.year = question.year?.toString() ?? '';
      form.source = question.source ?? '';
      form.explanation = question.explanation;
      form.isActive = question.isActive;
      // Replace options with fetched ones, preserving labels A-D as expected by the form.
      form.options = ['A', 'B', 'C', 'D', 'E'].map((label) => {
        const found = options.find((o) => o.label === label);
        return found
          ? { label, content: found.content, isCorrect: found.isCorrect }
          : { label, content: '', isCorrect: false };
      }).slice(0, Math.max(4, options.length));
      setInitial(form);
    });
  }, [params.questionId]);

  const submit = async (form: QuestionFormValue) => {
    const r = await api(`/api/admin/questions/${params.questionId}`, {
      method: 'PATCH',
      body: JSON.stringify(formValueToCreatePayload(form)),
    });
    if (!r.ok) {
      toast({ variant: 'destructive', title: 'Update failed', description: r.error.message });
      return;
    }
    toast({ title: 'Question updated' });
    router.push('/questions');
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!initial) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Edit question</h1>
      <QuestionForm initial={initial} onSubmit={submit} submitLabel="Save changes" />
    </div>
  );
}
