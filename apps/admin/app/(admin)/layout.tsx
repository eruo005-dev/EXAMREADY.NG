import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 border-r bg-muted/30 p-4">
        <Link href="/(admin)/dashboard" className="font-semibold">
          ExamReady <span className="text-primary">Admin</span>
        </Link>
        <nav className="mt-6 space-y-1 text-sm">
          {[
            ['/(admin)/dashboard', 'Overview'],
            ['/(admin)/questions', 'Questions'],
            ['/(admin)/users', 'Users'],
            ['/(admin)/moderation', 'Moderation'],
            ['/(admin)/broadcasts', 'Broadcasts'],
            ['/(admin)/bursaries', 'Bursaries'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
