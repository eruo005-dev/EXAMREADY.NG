'use client';

import { Button, Card, CardContent, Checkbox, Label } from '@examready/ui';
import { useEffect, useState } from 'react';


const CONSENT_KEY = 'examready.ndpr.consent.v2';

type ConsentCategories = {
  necessary: true;
  analytics: boolean;
  advertising: boolean;
};

type StoredConsent = {
  decision: 'accept_all' | 'essential_only' | 'custom';
  categories: ConsentCategories;
  ts: number;
};

/**
 * NDPR/GDPR consent banner.
 *
 * Three choices: Accept All / Reject Non-Essential / Customize. Decision
 * stored in localStorage AND posted to /api/consent for the audit trail
 * (consent_log table). Anonymous + signed-in users both pass through here.
 *
 * The actual gating of analytics/ads on this value happens in the layouts
 * that mount the scripts — this component is the UI + audit recorder.
 */
export function ConsentBanner() {
  const [decision, setDecision] = useState<'pending' | StoredConsent['decision']>('pending');
  const [showCustomize, setShowCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [advertising, setAdvertising] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(CONSENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredConsent;
        if (parsed.decision) setDecision(parsed.decision);
      }
    } catch {
      // bad JSON — ignore, show banner
    }
  }, []);

  const recordChoice = async (
    decisionValue: StoredConsent['decision'],
    categories: ConsentCategories,
  ) => {
    const stored: StoredConsent = { decision: decisionValue, categories, ts: Date.now() };
    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify(stored));
    } catch {
      // localStorage might be disabled (incognito with strict settings) — proceed without it
    }

    // Post to audit log. Fire-and-forget; if it fails we don't block the
    // user. A retry on next page load is fine.
    let sessionId: string | undefined;
    try {
      sessionId = window.sessionStorage.getItem('examready.session') ?? undefined;
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        window.sessionStorage.setItem('examready.session', sessionId);
      }
    } catch {
      sessionId = undefined;
    }

    void fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: decisionValue, categories, sessionId }),
    }).catch(() => undefined);

    setDecision(decisionValue);
  };

  const acceptAll = () =>
    recordChoice('accept_all', { necessary: true, analytics: true, advertising: true });
  const essentialOnly = () =>
    recordChoice('essential_only', { necessary: true, analytics: false, advertising: false });
  const saveCustom = () =>
    recordChoice('custom', { necessary: true, analytics, advertising });

  if (decision !== 'pending') return null;

  if (showCustomize) {
    return (
      <div
        role="dialog"
        aria-label="Customize cookie preferences"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      >
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-lg font-semibold">Customize cookie preferences</h2>
            <p className="text-sm text-muted-foreground">
              Pick what you&apos;re comfortable with. You can change this anytime in your settings.
            </p>

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Necessary</p>
                  <p className="text-xs text-muted-foreground">
                    Sign-in cookies, fraud prevention. Required for the site to work.
                  </p>
                </div>
                <Checkbox checked disabled />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <label className="flex items-start justify-between gap-3" htmlFor="analytics-cb">
                <div>
                  <Label htmlFor="analytics-cb" className="font-medium">Analytics</Label>
                  <p className="text-xs text-muted-foreground">
                    PostHog product analytics, Sentry error tracking. Helps us fix bugs and
                    improve features. No data sold or shared.
                  </p>
                </div>
                <Checkbox
                  id="analytics-cb"
                  checked={analytics}
                  onCheckedChange={(v) => setAnalytics(v === true)}
                />
              </label>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <label className="flex items-start justify-between gap-3" htmlFor="ads-cb">
                <div>
                  <Label htmlFor="ads-cb" className="font-medium">Advertising (free tier only)</Label>
                  <p className="text-xs text-muted-foreground">
                    Google AdSense ads on free-tier pages. Premium subscribers always see no
                    ads regardless. Users 13–17 always see only non-personalized ads.
                  </p>
                </div>
                <Checkbox
                  id="ads-cb"
                  checked={advertising}
                  onCheckedChange={(v) => setAdvertising(v === true)}
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setShowCustomize(false)}>
                Back
              </Button>
              <Button onClick={saveCustom}>Save preferences</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Privacy consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur-sm"
    >
      <div className="container flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          We use cookies for sign-in, analytics, and (for free-tier users) ads. Read our{' '}
          <a href="/privacy" className="underline">privacy policy</a> and{' '}
          <a href="/cookies" className="underline">cookie policy</a> for the full breakdown.
        </p>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowCustomize(true)}>
            Customize
          </Button>
          <Button variant="outline" size="sm" onClick={essentialOnly}>
            Reject non-essential
          </Button>
          <Button size="sm" onClick={acceptAll}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
