import Link from 'next/link';
import type { ReactNode } from 'react';

// Route groups (parentheses) are stripped from the URL by Next.js, so the
// actual paths are /dashboard, /questions, etc.
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/questions', label: 'Questions' },
  { href: '/users', label: 'Users' },
  { href: '/moderation', label: 'Moderation' },
  { href: '/broadcasts', label: 'Broadcasts' },
  { href: '/bursaries', label: 'Bursaries' },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 border-r bg-muted/30 p-4">
        <Link href="/dashboard" className="font-semibold">
          ExamReady <span className="text-primary">Admin</span>
        </Link>
        <nav className="mt-6 space-y-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
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
