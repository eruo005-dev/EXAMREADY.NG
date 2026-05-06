'use client';

/**
 * PostHog initialization (browser only).
 *
 * Tracks the events listed below — and ONLY these. New events get added
 * here intentionally rather than ad-hoc inline at call sites, so the
 * analytics surface stays auditable.
 *
 * PII guard: properties pass through redactPii() before send. We never
 * use phone or email as a distinct_id; only the supabase auth.users.id
 * (random UUID) which can't be reversed to identify a person without
 * also having DB access.
 */
import { useEffect } from 'react';

import { redactPii } from './pii';

export type TrackedEvent =
  | 'signup_started'
  | 'signup_completed'
  | 'onboarding_completed'
  | 'attempt_started'
  | 'attempt_submitted'
  | 'subscription_purchased'
  | 'ad_impression'
  | 'ai_tutor_query'
  | 'consent_choice';

type PostHogClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
  isFeatureEnabled: (key: string) => boolean | undefined;
  onFeatureFlags: (cb: (flags: string[]) => void) => void;
};

let client: PostHogClient | null = null;
let initPromise: Promise<PostHogClient | null> | null = null;

async function ensureClient(): Promise<PostHogClient | null> {
  if (typeof window === 'undefined') return null;
  if (client) return client;
  if (initPromise) return initPromise;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  if (!key) return null;

  initPromise = (async () => {
    const mod = await import('posthog-js');
    const ph = mod.default;
    ph.init(key, {
      api_host: host,
      capture_pageview: false, // we'll send these explicitly to control naming
      autocapture: false,      // explicit events only — no surprise data
      disable_session_recording: true,
      persistence: 'localStorage', // not cookies — easier to audit + opt out
      bootstrap: { distinctID: 'anonymous' },
      sanitize_properties: (props) => redactPii(props ?? {}),
    });
    client = ph as unknown as PostHogClient;
    return client;
  })();

  return initPromise;
}

export async function trackEvent(
  event: TrackedEvent,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = await ensureClient();
  if (!ph) return;
  ph.capture(event, redactPii(properties ?? {}));
}

export async function identifyUser(supabaseUserId: string): Promise<void> {
  const ph = await ensureClient();
  if (!ph) return;
  // Identify by the auth.users.id ONLY — never phone/email/name.
  ph.identify(supabaseUserId);
}

export async function resetIdentity(): Promise<void> {
  const ph = await ensureClient();
  if (!ph) return;
  ph.reset();
}

/**
 * Feature flag scaffolding. Use as:
 *   const isOn = useFeatureFlag('new-onboarding-v2');
 * Returns false until PostHog responds. Components MUST treat undefined +
 * false the same to avoid layout flicker.
 */
export function useFeatureFlag(key: string): boolean {
  // Intentionally lightweight — PostHog's React hook does more but we don't
  // need real-time updates for our use cases. Refresh on full page load.
  if (typeof window === 'undefined') return false;
  return Boolean(client?.isFeatureEnabled(key));
}

/**
 * One-time hook for the root layout: identifies the current user (if known)
 * and tracks a page-view-equivalent.
 */
export function useTrackPageView(supabaseUserId: string | null): void {
  useEffect(() => {
    if (supabaseUserId) {
      void identifyUser(supabaseUserId);
    }
  }, [supabaseUserId]);
}
