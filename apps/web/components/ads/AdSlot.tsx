'use client';

import { cn } from '@examready/ui';
import { useEffect, useRef } from 'react';


type AdSlotProps = {
  /** AdSense data-ad-slot — the slot id from your AdSense dashboard. */
  slotId: string;
  /** Logical placement name — for our own first-party impression tracking. */
  placement: string;
  /** User's subscription tier — null for anonymous visitors. */
  subscriptionTier: 'free' | 'basic' | 'pro' | null;
  /**
   * User's age — used for the "minor" branch (13–17 see only non-personalized ads
   * via data-tag-for-under-age-of-consent). null for anonymous.
   */
  age: number | null;
  /** Reserved width / height to prevent layout shift (CLS = 0). */
  width: number;
  height: number;
  className?: string;
};

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

/**
 * Tier-aware AdSense slot.
 *
 * Returns null (renders nothing) for:
 * - basic / pro subscribers — they paid to remove ads
 * - users under 13 — COPPA + AdSense policy violation
 *
 * Reserves the slot's pixel dimensions in CSS so layout doesn't shift
 * once the ad loads — CLS budget is critical for SEO and AdSense quality.
 */
export function AdSlot({
  slotId,
  placement,
  subscriptionTier,
  age,
  width,
  height,
  className,
}: AdSlotProps) {
  const insRef = useRef<HTMLModElement | null>(null);

  // Hard gates BEFORE any AdSense code runs.
  const shouldRender =
    subscriptionTier === 'free' &&
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID &&
    (age === null || age >= 13);

  // For minors (13-17), ads must be non-personalized.
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
