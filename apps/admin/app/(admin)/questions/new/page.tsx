'use client';

import { useToast } from '@examready/ui';
import { useRouter } from 'next/navigation';


import { QuestionForm, type QuestionFormValue } from '@/components/QuestionForm';
import { api } from '@/lib/api';

export default function NewQuestionPage() {
  const router = useRouter();
  const { toast } = useToast();

  const submit = async (form: QuestionFormValue) => {
    const r = await api<{ question: { id: string } }>('/api/admin/questions', {
      method: 'POST',
      body: JSON.stringify(formValueToCreatePayload(form)),
    });
    if (!r.ok) {
      toast({
        variant: 'destructive',
        title: 'Could not create question',
        description: r.error.message,
      });
      return;
    }
    toast({ title: 'Question created' });
    router.push('/questions');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">New question</h1>
      <QuestionForm onSubmit={submit} submitLabel="Create question" />
    </div>
  );
}

export function formValueToCreatePayload(form: QuestionFormValue) {
  return {
    examId: form.examId,
    subjectId: form.subjectId,
    topicId: form.topicId,
    questionType: form.questionType,
    stem: form.stem,
    passage: form.passage || undefined,
    media: [],
    difficulty: form.difficulty,
    year: form.year ? Number(form.year) : undefined,
    source: form.source || undefined,
    explanation: form.explanation,
    frequencyScore: 50,
    isActive: form.isActive,
    options: form.options
      .filter((o) => o.content.trim().length > 0)
      .map((o, idx) => ({
        label: o.label,
        content: o.content.trim(),
        isCorrect: o.isCorrect,
        sortOrder: idx,
      })),
  };
}
