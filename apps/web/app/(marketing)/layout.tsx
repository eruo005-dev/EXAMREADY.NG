import { Button } from '@examready/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ConsentBanner } from '@/components/ads/ConsentBanner';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="bg-primary text-primary-foreground grid h-8 w-8 place-items-center rounded-md font-bold">
              E
            </span>
            <span>
              ExamReady<span className="text-primary">.ng</span>
            </span>
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Primary">
            <Link
              href="/pricing"
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium"
            >
              Pricing
            </Link>
            <Link
              href="/blog"
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium"
            >
              Blog
            </Link>
            <Link
              href="/faq"
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium"
            >
              FAQ
            </Link>
            <Link
              href="/about"
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium"
            >
              About
            </Link>
            <Link
              href="/contact"
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium"
            >
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

      <footer className="bg-muted/30 border-t">
        <div className="container py-12">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <p className="font-semibold">ExamReady.ng</p>
              <p className="text-muted-foreground mt-2 text-sm">
                Pass JAMB, WAEC, NECO, Post-UTME with confidence. Made in Nigeria, for Nigerian
                students.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">Product</p>
              <ul className="text-muted-foreground mt-3 space-y-2 text-sm">
                <li>
                  <Link href="/pricing">Pricing</Link>
                </li>
                <li>
                  <Link href="/signup">Get started</Link>
                </li>
                <li>
                  <Link href="/login">Sign in</Link>
                </li>
                <li>
                  <Link href="/coming-soon">Coming soon</Link>
                </li>
                <li>
                  <Link href="/tools/subject-combinations">Free tools</Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Company</p>
              <ul className="text-muted-foreground mt-3 space-y-2 text-sm">
                <li>
                  <Link href="/about">About</Link>
                </li>
                <li>
                  <Link href="/faq">FAQ</Link>
                </li>
                <li>
                  <Link href="/contact">Contact</Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">Legal</p>
              <ul className="text-muted-foreground mt-3 space-y-2 text-sm">
                <li>
                  <Link href="/privacy">Privacy</Link>
                </li>
                <li>
                  <Link href="/terms">Terms</Link>
                </li>
                <li>
                  <Link href="/cookies">Cookies</Link>
                </li>
              </ul>
            </div>
          </div>
          <p className="text-muted-foreground mt-10 border-t pt-6 text-xs">
            © {new Date().getFullYear()} ExamReady.ng — All rights reserved. Naira pricing only.
          </p>
        </div>
      </footer>

      <ConsentBanner />
    </div>
  );
}
