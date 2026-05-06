import type { Metadata, Viewport } from 'next';
import { Inter, Lora } from 'next/font/google';
import type { ReactNode } from 'react';

import { Providers } from './providers';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const lora = Lora({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-lora',
});

export const metadata: Metadata = {
  title: {
    default: 'ExamReady.ng — Pass JAMB, WAEC, NECO with confidence',
    template: '%s · ExamReady.ng',
  },
  description:
    'Nigeria\'s most trusted online exam prep. AI-powered practice for JAMB, WAEC, NECO, GCE, Post-UTME and professional exams. Mobile-first, works on 2G/3G.',
  keywords: ['JAMB', 'WAEC', 'NECO', 'Post-UTME', 'GCE', 'NABTEB', 'Nigerian students', 'exam prep'],
  authors: [{ name: 'ExamReady.ng' }],
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: 'https://examready.ng',
    siteName: 'ExamReady.ng',
    images: ['/og-image.png'],
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG" suppressHydrationWarning className={`${inter.variable} ${lora.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
