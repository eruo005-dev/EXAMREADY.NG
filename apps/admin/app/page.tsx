import { Button, Card, CardContent } from '@examready/ui';
import Link from 'next/link';


export default function AdminLandingPage() {
  return (
    <div className="container flex min-h-screen items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6">
          <div>
            <h1 className="text-2xl font-bold">ExamReady Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Internal tool. Restricted to staff with admin role.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href="/dashboard">Continue</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Sprint 0 admin shell — bulk question import, user management, broadcast composer, and bursary review queue land in subsequent sprints.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
