'use client';

import { Button, Card, CardContent } from '@examready/ui';
import { AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';


export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Lazy-load Sentry on the client and capture the error. The dynamic
    // import means Sentry isn't bundled when DSN is unset (it short-circuits
    // inside the wrapper). We swallow any failure — error reporting failing
    // shouldn't make a bad page worse.
    void (async () => {
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureException(error);
      } catch {
        // Sentry not configured — fine.
      }
    })();
  }, [error]);

  return (
    <div className="container flex min-h-[80vh] flex-col items-center justify-center py-12 text-center">
      <div className="mb-6 grid h-20 w-20 place-items-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      </div>
      <h1 className="mb-3 text-3xl font-bold tracking-tight">Something broke on our end</h1>
      <p className="mb-8 max-w-md text-muted-foreground">
        Our team has been notified automatically. Try again, or come back in a minute.
      </p>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>

      {error.digest && (
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          Error ID: <span className="select-all">{error.digest}</span>
        </p>
      )}

      <Card className="mt-12 max-w-md">
        <CardContent className="space-y-2 pt-6 text-left">
          <p className="flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="h-4 w-4" /> Want to tell us what happened?
          </p>
          <p className="text-sm text-muted-foreground">
            Send the Error ID above to us on{' '}
            <Link href="/contact" className="text-primary underline">WhatsApp</Link>.
            Premium subscribers get priority response.
          </p>
        </CardContent>
      </Card>

      {process.env.NODE_ENV === 'development' && (
        <details className="mt-8 max-w-2xl text-left">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Stack trace (dev only)
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-4 text-xs">
            {error.message}
            {'\n\n'}
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  );
}
