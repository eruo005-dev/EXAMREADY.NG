'use client';

import { Button, Card, CardContent, Input, Label } from '@examready/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { createClient } from '@/lib/auth/client';

export function AdminLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const redirect = search.get('redirect') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      router.replace(redirect);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container flex min-h-screen items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <h1 className="mb-1 text-2xl font-bold">ExamReady Admin</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            Internal tool. Restricted to staff with admin role.
          </p>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-xs">
            Forgot your password? Contact another admin to reset via Supabase dashboard.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
