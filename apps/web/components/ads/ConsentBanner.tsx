'use client';

import { Button } from '@examready/ui';
import { useEffect, useState } from 'react';


const CONSENT_KEY = 'examready.ndpr.consent.v1';

/**
 * NDPR / GDPR-style consent banner. Shown until the user makes a choice.
 *
 * "Accept" stores 'accepted' — analytics + AdSense load.
 * "Reject non-essential" stores 'essential-only' — only Sentry (error
 * tracking) and the auth cookie load. Ads remain hidden.
 *
 * The actual gating of analytics/ads scripts on this value happens in
 * the layouts that mount them — this component is just the UI.
 */
export function ConsentBanner() {
  const [decision, setDecision] = useState<'pending' | 'accepted' | 'essential-only'>('pending');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = window.localStorage.getItem(CONSENT_KEY);
    if (v === 'accepted' || v === 'essential-only') setDecision(v);
  }, []);

  const choose = (v: 'accepted' | 'essential-only') => {
    window.localStorage.setItem(CONSENT_KEY, v);
    setDecision(v);
  };

  if (decision !== 'pending') return null;

  return (
    <div
      role="dialog"
      aria-label="Privacy consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur-sm"
    >
      <div className="container flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          We use cookies for sign-in, analytics, and (for free-tier users) ads. Read our{' '}
          <a href="/privacy" className="underline">
            privacy policy
          </a>{' '}
          for details.
        </p>
        <div className="flex flex-shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => choose('essential-only')}>
            Essential only
          </Button>
          <Button size="sm" onClick={() => choose('accepted')}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
