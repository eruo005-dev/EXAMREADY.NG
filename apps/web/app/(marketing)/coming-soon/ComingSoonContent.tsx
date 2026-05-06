'use client';

import { Badge, Button, Card, CardContent, Input, useToast } from '@examready/ui';
import { CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';


type Exam = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverageStatus: 'live' | 'coming_soon' | 'planned';
};

export function ComingSoonContent() {
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [signups, setSignups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/exams?include=all')
      .then((r) => r.json())
      .then((d) => {
        const all: Exam[] = d?.data?.exams ?? [];
        setExams(all.filter((e) => e.coverageStatus !== 'live'));
      })
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>, examSlug: string) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    if (!email) return;

    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, examSlug, sourceUrl: window.location.href }),
    });
    if (res.ok) {
      setSignups((prev) => ({ ...prev, [examSlug]: true }));
      toast({ title: 'You\'re on the list', description: 'We\'ll email you when this exam launches.' });
    } else {
      toast({ variant: 'destructive', title: 'Could not save', description: 'Try again in a moment.' });
    }
  };

  const grouped = {
    coming_soon: exams.filter((e) => e.coverageStatus === 'coming_soon'),
    planned: exams.filter((e) => e.coverageStatus === 'planned'),
  };

  return (
    <div className="container max-w-4xl py-16">
      <h1 className="text-4xl font-bold tracking-tight">Coming soon</h1>
      <p className="mt-4 text-muted-foreground">
        We&apos;re focused on JAMB UTME first — get that right, then expand. Below are the
        exams we&apos;re building next. Drop your email beside any exam and we&apos;ll
        message you the day it launches. No marketing spam.
      </p>

      {loading && <p className="mt-12 text-sm text-muted-foreground">Loading…</p>}

      <Section
        title="Building next (next 3 months)"
        icon={Clock}
        description="Already in our roadmap. Most have content drafts and admin import in flight."
        exams={grouped.coming_soon}
        onSubmit={submit}
        signups={signups}
      />

      <Section
        title="Planned"
        icon={Clock}
        description="On the longer-term roadmap. Strong demand from a particular waitlist will move an exam up."
        exams={grouped.planned}
        onSubmit={submit}
        signups={signups}
      />

      <div className="mt-16 rounded-lg border border-dashed bg-muted/30 p-6">
        <p className="font-semibold">Don&apos;t see your exam?</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Email us at{' '}
          <Link href="mailto:hello@examready.ng" className="underline">hello@examready.ng</Link>{' '}
          with the exam name. If multiple students request the same one, we prioritise it.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  exams,
  onSubmit,
  signups,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  exams: Exam[];
  onSubmit: (e: React.FormEvent<HTMLFormElement>, slug: string) => void;
  signups: Record<string, boolean>;
}) {
  if (exams.length === 0) return null;
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {exams.map((exam) => (
          <Card key={exam.id}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{exam.name}</p>
                  {exam.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{exam.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="flex-shrink-0 text-xs">
                  {exam.coverageStatus === 'coming_soon' ? 'Coming soon' : 'Planned'}
                </Badge>
              </div>

              {signups[exam.slug] ? (
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  We&apos;ll email you when this launches
                </div>
              ) : (
                <form className="flex gap-2" onSubmit={(e) => onSubmit(e, exam.slug)}>
                  <Input
                    type="email"
                    name="email"
                    required
                    placeholder="your@email.com"
                    className="flex-1"
                  />
                  <Button type="submit">Notify me</Button>
                </form>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
