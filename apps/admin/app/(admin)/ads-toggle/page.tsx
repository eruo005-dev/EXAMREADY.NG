'use client';

import { Badge, Button, Card, CardContent, useToast } from '@examready/ui';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';


import { api } from '@/lib/api';

type SettingsResponse = {
  settings: Record<string, unknown>;
};

export default function AdsTogglePage() {
  const { toast } = useToast();
  const [adsEnabled, setAdsEnabled] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = () => {
    api<SettingsResponse>('/api/admin/settings').then((r) => {
      if (!r.ok) {
        toast({ variant: 'destructive', title: 'Could not load', description: r.error.message });
        return;
      }
      const v = r.data.settings.ads_enabled;
      setAdsEnabled(v === undefined ? true : v === true);
    });
  };

  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setEnabled = async (next: boolean) => {
    if (
      !next &&
      !confirm(
        'Disable AdSense globally?\n\nThis hides ALL ad slots from free-tier users immediately. Use only if Google has flagged the account or for a planned compliance pause.',
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      const r = await api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ key: 'ads_enabled', value: next }),
      });
      if (!r.ok) {
        toast({ variant: 'destructive', title: 'Update failed', description: r.error.message });
        return;
      }
      setAdsEnabled(next);
      toast({
        title: next ? 'Ads enabled' : 'Ads disabled',
        description: next
          ? 'Free-tier users will start seeing ads on the next page render.'
          : 'All ad slots are now hidden site-wide.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AdSense Kill Switch</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Globally disable all AdSense ads with one click. Use this if Google
          flags the account, during a pending policy review, or for a planned
          compliance pause.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            {adsEnabled === null ? (
              <Badge variant="outline">Loading…</Badge>
            ) : adsEnabled ? (
              <>
                <ShieldCheck className="mt-0.5 h-5 w-5 text-success" />
                <div>
                  <p className="font-medium">Ads are currently <strong>enabled</strong></p>
                  <p className="text-sm text-muted-foreground">
                    Free-tier users on the dashboard, practice, and results pages
                    see ads. Premium users always see no ads regardless.
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
                <div>
                  <p className="font-medium">Ads are currently <strong>disabled</strong></p>
                  <p className="text-sm text-muted-foreground">
                    No AdSense slots are rendering anywhere on the site. The
                    AdSense script itself is not loaded for any user.
                  </p>
                </div>
              </>
            )}
          </div>

          {adsEnabled === true && (
            <Button variant="destructive" onClick={() => setEnabled(false)} disabled={submitting}>
              {submitting ? 'Saving…' : 'Disable ads (kill switch)'}
            </Button>
          )}
          {adsEnabled === false && (
            <Button onClick={() => setEnabled(true)} disabled={submitting}>
              {submitting ? 'Saving…' : 'Re-enable ads'}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="font-semibold">When to flip this</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Google AdSense email warning about a policy issue</li>
            <li>Account suspended, awaiting review</li>
            <li>Bulk content takedown (e.g. exam board legal complaint about questions)</li>
            <li>Test deployment of a non-AdSense alternative</li>
          </ul>
          <p className="mt-4 font-semibold">What this does NOT do</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Refund free-tier users (they never paid)</li>
            <li>Cancel pending AdSense earnings (those settle independently)</li>
            <li>Hide existing ad placements&apos; reserved space — CLS budget remains 0
              because no slot was rendered in the first place</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
