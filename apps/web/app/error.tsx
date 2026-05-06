'use client';

import { Button } from '@examready/ui';

export default function RootError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h2 className="mb-2 text-2xl font-semibold">Something went wrong</h2>
      <p className="mb-6 max-w-md text-muted-foreground">
        We hit an unexpected error. Try again, or refresh the page. If this keeps happening, get in touch via WhatsApp from the contact page.
      </p>
      <Button onClick={reset}>Try again</Button>
      {process.env.NODE_ENV === 'development' && (
        <pre className="mt-6 max-w-2xl overflow-auto rounded bg-muted p-4 text-left text-xs">
          {error.message}
        </pre>
      )}
    </div>
  );
}
