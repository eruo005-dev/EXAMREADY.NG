'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Card, CardContent, Input, Label, useToast } from '@examready/ui';

type Step = 'phone' | 'code';

export function PhoneOtpForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendable, setResendable] = useState(false);

  const requestOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/phone/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error?.message ?? 'Could not send code';
        toast({ variant: 'destructive', title: 'Error', description: msg });
        return;
      }
      setStep('code');
      toast({ title: 'Code sent', description: `Check your WhatsApp for the 6-digit code.` });
      setTimeout(() => setResendable(true), 30_000);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Network error', description: String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const resendSms = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/phone/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, channel: 'sms' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Error', description: data?.error?.message ?? 'Resend failed' });
        return;
      }
      toast({ title: 'SMS sent', description: 'Check your messages for the code.' });
      setResendable(false);
      setTimeout(() => setResendable(true), 30_000);
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Invalid code', description: data?.error?.message ?? 'Try again' });
        return;
      }
      router.push(data.data.isNewUser ? '/onboarding' : '/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardContent className="pt-6">
        {step === 'phone' ? (
          <form className="space-y-4" onSubmit={requestOtp}>
            <div>
              <h1 className="text-2xl font-bold">Sign in with phone</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                We&apos;ll send a 6-digit code to your WhatsApp.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                inputMode="tel"
                placeholder="+234 801 234 5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
              />
              <p className="text-xs text-muted-foreground">
                Nigerian number, international format.
              </p>
            </div>
            <Button type="submit" disabled={submitting || phone.length < 10} className="w-full">
              {submitting ? 'Sending…' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={verify}>
            <div>
              <h1 className="text-2xl font-bold">Enter the code</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Sent to {phone}. Code expires in 10 minutes.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">6-digit code</Label>
              <Input
                id="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                autoComplete="one-time-code"
              />
            </div>
            <Button type="submit" disabled={submitting || code.length !== 6} className="w-full">
              {submitting ? 'Verifying…' : 'Verify'}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setStep('phone')}
              >
                ← Use a different number
              </button>
              {resendable ? (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  disabled={submitting}
                  onClick={resendSms}
                >
                  Send via SMS
                </button>
              ) : (
                <span className="text-muted-foreground">Didn&apos;t get it?</span>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
