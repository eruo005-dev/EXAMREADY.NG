import { Button, Card, CardContent } from '@examready/ui';
import { ArrowLeft, Compass, MessageCircle } from 'lucide-react';
import Link from 'next/link';


export default function NotFound() {
  return (
    <div className="container flex min-h-[80vh] flex-col items-center justify-center py-12 text-center">
      <div className="mb-6 grid h-20 w-20 place-items-center rounded-full bg-muted">
        <Compass className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="mb-2 font-mono text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mb-3 text-3xl font-bold tracking-tight">This page is not in the syllabus</h1>
      <p className="mb-8 max-w-md text-muted-foreground">
        Either the link is outdated or someone typed it wrong. Either way — back to revising.
        JAMB doesn&apos;t care about excuses.
      </p>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" /> Back home
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>

      <Card className="mt-12 max-w-md">
        <CardContent className="space-y-2 pt-6 text-left">
          <p className="flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="h-4 w-4" /> Found a broken link?
          </p>
          <p className="text-sm text-muted-foreground">
            We&apos;d like to know. Tell us where you came from on{' '}
            <Link href="/contact" className="text-primary underline">WhatsApp</Link>{' '}
            and we&apos;ll fix it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
