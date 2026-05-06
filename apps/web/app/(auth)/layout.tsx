import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary font-bold text-primary-foreground">
              E
            </span>
            <span>ExamReady<span className="text-primary">.ng</span></span>
          </Link>
        </div>
      </header>
      <main className="container flex flex-1 items-center justify-center py-12">{children}</main>
    </div>
  );
}
