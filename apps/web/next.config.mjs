import nextPwa from 'next-pwa';

const withPWA = nextPwa({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // Disable PWA in dev — service worker caching makes hot reload painful.
  disable: process.env.NODE_ENV !== 'production',
  // Cache strategies tuned for low-bandwidth NG networks (2G/3G).
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: 'CacheFirst',
      options: { cacheName: 'google-fonts', expiration: { maxEntries: 4, maxAgeSeconds: 31536000 } },
    },
    {
      urlPattern: /\/_next\/image\?url=.*/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'next-image', expiration: { maxEntries: 100, maxAgeSeconds: 86400 } },
    },
    {
      urlPattern: /\/api\/exams.*/i,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'api-catalog', expiration: { maxEntries: 50, maxAgeSeconds: 3600 } },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages — they ship raw TS.
  transpilePackages: [
    '@examready/ui',
    '@examready/shared',
    '@examready/db',
    '@examready/notifications',
  ],
  experimental: {
    instrumentationHook: false,
  },
  images: {
    formats: ['image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
    ],
  },
  // CSP and other security headers also live in vercel.json so they apply
  // at the edge before Next.js. Duplicating here ensures they're set in
  // local dev too.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
