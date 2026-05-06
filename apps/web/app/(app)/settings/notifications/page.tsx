'use client';

import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  Label,
  useToast,
} from '@examready/ui';
import { useEffect, useState } from 'react';


type Prefs = {
  whatsappOptedIn: boolean;
  smsOptedIn: boolean;
  emailOptedIn: boolean;
  preferredNotificationTime: string;
  timezone: string;
};

export default function NotificationsSettingsPage() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) =>
        setPrefs({
          whatsappOptedIn: d.data.user.whatsappOptedIn,
          smsOptedIn: d.data.user.smsOptedIn,
          emailOptedIn: d.data.user.emailOptedIn,
          preferredNotificationTime: d.data.user.preferredNotificationTime ?? '18:00',
          timezone: d.data.user.timezone ?? 'Africa/Lagos',
        }),
      );
  }, []);

  if (!prefs) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/me/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Save failed', description: data?.error?.message });
        return;
      }
      toast({ title: 'Saved', description: 'Your notification preferences have been updated.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Notifications</h1>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="font-semibold">Channels</p>
          <label className="flex items-center gap-3">
            <Checkbox
              checked={prefs.whatsappOptedIn}
              onCheckedChange={(v) => setPrefs({ ...prefs, whatsappOptedIn: v === true })}
            />
            <div>
              <p className="text-sm font-medium">WhatsApp</p>
              <p className="text-xs text-muted-foreground">Daily reminders, streak alerts, weekly summary.</p>
            </div>
          </label>
          <label className="flex items-center gap-3">
            <Checkbox
              checked={prefs.smsOptedIn}
              onCheckedChange={(v) => setPrefs({ ...prefs, smsOptedIn: v === true })}
            />
            <div>
              <p className="text-sm font-medium">SMS</p>
              <p className="text-xs text-muted-foreground">Backup channel for OTPs and payment receipts.</p>
            </div>
          </label>
          <label className="flex items-center gap-3">
            <Checkbox
              checked={prefs.emailOptedIn}
              onCheckedChange={(v) => setPrefs({ ...prefs, emailOptedIn: v === true })}
            />
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-xs text-muted-foreground">Weekly progress summary, payment receipts.</p>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="time">Preferred reminder time</Label>
            <Input
              id="time"
              type="time"
              value={prefs.preferredNotificationTime}
              onChange={(e) => setPrefs({ ...prefs, preferredNotificationTime: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">In your local time ({prefs.timezone}).</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save preferences'}
      </Button>
    </div>
  );
}
