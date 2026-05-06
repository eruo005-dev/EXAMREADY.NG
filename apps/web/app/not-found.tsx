import Link from 'next/link';

import { Button } from '@examready/ui';

export default function NotFound() {
  return (
    <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <p className="mb-2 text-sm font-medium text-muted-foreground">404</p>
      <h2 className="mb-2 text-2xl font-semibold">Page not found</h2>
      <p className="mb-6 max-w-md text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Button asChild>
        <Link href="/">Back home</Link>
      </Button>
    </div>
  );
}
