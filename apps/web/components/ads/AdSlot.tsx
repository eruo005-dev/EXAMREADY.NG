'use client';

import { cn } from '@examready/ui';
import { useEffect, useRef } from 'react';


/**
 * Logical placement → AdSense slot env var. Adding a new placement?
 * Add an entry here and a new env var to .env.example. Never hard-code
 * slot IDs — they change per AdSense account/region.
 *
 * Note on env access: Next.js inlines NEXT_PUBLIC_* at build time only when
 * accessed via the literal `process.env.SOMETHING_LITERAL`. Dynamic key
 * access (`process.env[name]`) returns undefined in the browser bundle.
 * Hence the explicit per-placement switch below.
 */
const PLACEMENTS = {
  dashboard_sidebar: { width: 300, height: 250 },
  practice_interstitial: { width: 336, height: 280 },
  results_top: { width: 336, height: 280 },
  footer_banner: { width: 728, height: 90 },
} as const;

export type AdPlacement = keyof typeof PLACEMENTS;

function slotIdFor(placement: AdPlacement): string | undefined {
  switch (placement) {
    case 'dashboard_sidebar':
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD_SIDEBAR;
    case 'practice_interstitial':
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_PRACTICE_INTERSTITIAL;
    case 'results_top':
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_RESULTS_TOP;
    case 'footer_banner':
      return process.env.NEXT_PUBLIC_ADSENSE_SLOT_FOOTER_BANNER;
  }
}

type AdSlotProps = {
  /** Logical placement; the slot ID and dimensions are looked up from this. */
  placement: AdPlacement;
  /** User's subscription tier — null for anonymous visitors. */
  subscriptionTier: 'free' | 'basic' | 'pro' | null;
  /**
   * User's age. null for anonymous. Users 13–17 see only non-personalized ads
   * via data-tag-for-under-age-of-consent. Users <13 are blocked entirely.
   */
  age: number | null;
  /** When false (kill switch), AdSlot renders nothing regardless of tier. */
  adsEnabled?: boolean;
  /** Override dimensions if the placement default doesn't fit. */
  width?: number;
  height?: number;
  className?: string;
};

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

/**
 * Tier-aware, age-aware, killswitch-aware AdSense slot.
 *
 * Returns null for:
 * - basic / pro subscribers — they paid to remove ads
 * - users under 13 — COPPA + AdSense policy violation
 * - adsEnabled=false — admin kill switch flipped
 * - missing AdSense client id — pre-approval state, ads not yet wired
 *
 * Reserves the slot's pixel dimensions in CSS so layout doesn't shift
 * once the ad loads. CLS budget is critical for SEO + AdSense quality.
 */
export function AdSlot({
  placement,
  subscriptionTier,
  age,
  adsEnabled = true,
  width: widthOverride,
  height: heightOverride,
  className,
}: AdSlotProps) {
  const insRef = useRef<HTMLModElement | null>(null);

  const slotId = slotIdFor(placement);
  const dims = PLACEMENTS[placement];
  const width = widthOverride ?? dims.width;
  const height = heightOverride ?? dims.height;

  // Hard gates BEFORE any AdSense code runs.
  const shouldRender =
    adsEnabled &&
    subscriptionTier === 'free' &&
    Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID) &&
    Boolean(slotId) &&
    (age === null || age >= 13);

  // For minors (13–17), ads must be non-personalized.
  const isMinor = age !== null && age >= 13 && age < 18;

  useEffect(() => {
    if (!shouldRender) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window.adsbygoogle = window.adsbygoogle || []) as any[]).push({});
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AdSlot] adsbygoogle.push failed:', err);
    }
  }, [shouldRender, slotId]);

  // First-party impression tracking — beacon, fire-and-forget.
  useEffect(() => {
    if (!shouldRender) return;
    if (typeof navigator === 'undefined' || !('sendBeacon' in navigator)) return;
    const body = JSON.stringify({ placement });
    try {
      navigator.sendBeacon('/api/internal/ad-impression', body);
    } catch {
      // Beacon best-effort; ignore errors.
    }
  }, [shouldRender, placement]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn('mx-auto flex items-center justify-center overflow-hidden', className)}
      style={{ width, height, minWidth: width, minHeight: height }}
      data-ad-placement={placement}
    >
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', width, height }}
        data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="false"
        {...(isMinor ? { 'data-tag-for-under-age-of-consent': 1 } : {})}
      />
    </div>
  );
}
