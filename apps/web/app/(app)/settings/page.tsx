import Link from 'next/link';

import { Card, CardContent } from '@examready/ui';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
        <CardContent className="space-y-2 pt-6">
          <SettingsLink href="/settings/notifications" title="Notifications" description="Channels, reminder time, opt-ins." />
          <SettingsLink href="/settings/subscription" title="Subscription" description="Manage your plan and billing." />
          <SettingsLink href="/api/auth/logout" title="Sign out" description="" />
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="block rounded-md border p-4 hover:bg-muted">
      <p className="font-medium">{title}</p>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </Link>
  );
}
