import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getAdminUser } from '@/lib/auth/server';

// Route groups (parentheses) are stripped from the URL by Next.js, so the
// actual paths are /dashboard, /questions, etc.
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/questions', label: 'Questions' },
  { href: '/questions/generate', label: '↳ Generate with AI' },
  { href: '/questions/ai-queue', label: '↳ AI moderation queue' },
  { href: '/ai-quality-review', label: '↳ AI quality review' },
  { href: '/users', label: 'Users' },
  { href: '/moderation', label: 'Moderation' },
  { href: '/broadcasts', label: 'Broadcasts' },
  { href: '/bursaries', label: 'Bursaries' },
  { href: '/ads-toggle', label: 'Ads kill switch' },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const auth = await getAdminUser();
  if (!auth.ok) {
    if (auth.reason === 'unauthenticated') redirect('/login');
    redirect('/login?error=not_admin');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="bg-muted/30 w-60 border-r p-4">
        <Link href="/dashboard" className="font-semibold">
          ExamReady <span className="text-primary">Admin</span>
        </Link>
        <p className="text-muted-foreground mt-1 text-xs">{auth.user.email}</p>
        <nav className="mt-6 space-y-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:bg-muted hover:text-foreground block rounded-md px-3 py-2"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
