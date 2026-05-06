import { Button } from '@examready/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';


import { ConsentBanner } from '@/components/ads/ConsentBanner';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary font-bold text-primary-foreground">
              E
            </span>
            <span>ExamReady<span className="text-primary">.ng</span></span>
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Primary">
            <Link href="/pricing" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
            <Link href="/about" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              About
            </Link>
            <Link href="/contact" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Contact
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/30">
        <div className="container py-12">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <p className="font-semibold">ExamReady.ng</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Pass JAMB, WAEC, NECO, Post-UTME with confidence. Made in Nigeria, for Nigerian students.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Product</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><Link href="/pricing">Pricing</Link></li>
                <li><Link href="/signup">Get started</Link></li>
                <li><Link href="/login">Sign in</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Company</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><Link href="/about">About</Link></li>
                <li><Link href="/contact">Contact</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Legal</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><Link href="/privacy">Privacy</Link></li>
                <li><Link href="/terms">Terms</Link></li>
              </ul>
            </div>
          </div>
          <p className="mt-10 border-t pt-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} ExamReady.ng — All rights reserved. Naira pricing only.
          </p>
        </div>
      </footer>

      <ConsentBanner />
    </div>
  );
}
