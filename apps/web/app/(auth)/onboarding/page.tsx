'use client';

import { NIGERIAN_STATES } from '@examready/shared';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@examready/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';



type Exam = { id: string; name: string; slug: string };

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [state, setState] = useState('');
  const [school, setSchool] = useState('');
  const [examId, setExamId] = useState('');
  const [examDate, setExamDate] = useState('');
  const [whatsappOptedIn, setWa] = useState(true);
  const [smsOptedIn, setSms] = useState(true);
  const [emailOptedIn, setEmail] = useState(true);
  const [preferredTime, setPreferredTime] = useState('18:00');

  useEffect(() => {
    fetch('/api/exams')
      .then((r) => r.json())
      .then((d) => setExams(d?.data?.exams ?? []))
      .catch(() => setExams([]));
  }, []);

  const next = () => setStep((s) => Math.min(s + 1, 4));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    if (!fullName || !age || !state || !examId) {
      toast({ variant: 'destructive', title: 'Please complete all fields' });
      return;
    }
    if (typeof age === 'number' && age < 13) {
      toast({ variant: 'destructive', title: 'Sorry', description: 'You must be at least 13 to use ExamReady.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/me/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          age,
          state,
          school: school || undefined,
          targetExams: [{ examId, examDate: examDate || undefined, priority: 1 }],
          whatsappOptedIn,
          smsOptedIn,
          emailOptedIn,
          preferredNotificationTime: preferredTime,
          timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Africa/Lagos',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Could not save', description: data?.error?.message ?? 'Try again' });
        return;
      }
      router.push('/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  const totalSteps = 5;
  const progress = ((step + 1) / totalSteps) * 100;

  return (
    <div className="w-full max-w-md space-y-4">
      <div>
        <Progress value={progress} className="h-1" />
        <p className="mt-2 text-xs text-muted-foreground">
          Step {step + 1} of {totalSteps}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {step === 0 && (
            <>
              <h2 className="text-xl font-bold">What&apos;s your name?</h2>
              <p className="text-sm text-muted-foreground">We&apos;ll use this to personalise your dashboard.</p>
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  min={13}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">You must be at least 13 to use ExamReady.</p>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-xl font-bold">Where do you study?</h2>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger id="state">
                    <SelectValue placeholder="Pick your state" />
                  </SelectTrigger>
                  <SelectContent>
                    {NIGERIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="school">School (optional)</Label>
                <Input id="school" value={school} onChange={(e) => setSchool(e.target.value)} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-bold">Which exam are you preparing for?</h2>
              <div className="space-y-2">
                <Label htmlFor="exam">Exam</Label>
                <Select value={examId} onValueChange={setExamId}>
                  <SelectTrigger id="exam">
                    <SelectValue placeholder="Pick an exam" />
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
                <Label htmlFor="examDate">Exam date (optional)</Label>
                <Input
                  id="examDate"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  We&apos;ll use this to count down the days and personalise reminders.
                </p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-xl font-bold">How should we reach you?</h2>
              <p className="text-sm text-muted-foreground">
                Daily reminders, weekly summaries, and exam countdowns. You can change this anytime.
              </p>
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <Checkbox checked={whatsappOptedIn} onCheckedChange={(v) => setWa(v === true)} />
                  <span className="text-sm">WhatsApp (recommended)</span>
                </label>
                <label className="flex items-center gap-3">
                  <Checkbox checked={smsOptedIn} onCheckedChange={(v) => setSms(v === true)} />
                  <span className="text-sm">SMS (backup)</span>
                </label>
                <label className="flex items-center gap-3">
                  <Checkbox checked={emailOptedIn} onCheckedChange={(v) => setEmail(v === true)} />
                  <span className="text-sm">Email (weekly summary only)</span>
                </label>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-xl font-bold">When do you usually study?</h2>
              <p className="text-sm text-muted-foreground">We&apos;ll send your daily reminder around this time.</p>
              <div className="space-y-2">
                <Label htmlFor="time">Preferred time</Label>
                <Input
                  id="time"
                  type="time"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-2">
            {step > 0 ? (
              <Button variant="ghost" onClick={back} disabled={submitting}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < 4 ? (
              <Button onClick={next}>Next</Button>
            ) : (
              <Button onClick={submit} disabled={submitting}>
                {submitting ? 'Saving…' : 'Finish'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
