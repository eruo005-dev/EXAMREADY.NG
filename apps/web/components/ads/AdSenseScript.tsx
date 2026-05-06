'use client';

import Script from 'next/script';

/**
 * Google AdSense loader.
 *
 * - Loads ONLY when NEXT_PUBLIC_ADSENSE_CLIENT_ID is set (until AdSense
 *   approval there's no client id, so the script never loads at all)
 * - Strategy: lazyOnload — never blocks page interactivity
 * - Should ONLY be mounted from layouts that gate it on tier/age (see
 *   AdSlot for the actual gate). Mounting this component just makes the
 *   library available; it doesn't render any ad slots.
 */
export function AdSenseScript() {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  if (!clientId) return null;

  return (
    <Script
      id="google-adsense"
      strategy="lazyOnload"
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
    />
  );
}
