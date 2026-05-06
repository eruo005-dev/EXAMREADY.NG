import { users } from '@examready/db/schema';
import { eq } from 'drizzle-orm';
import { Home, Settings, Trophy, Users } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';


import { AdSenseScript } from '@/components/ads/AdSenseScript';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { getAdsEnabled } from '@/lib/admin/settings';
import { createServerClient } from '@/lib/auth/server';
import { db } from '@/lib/db';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const profile = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!profile) redirect('/login');

  if (!profile.onboardingCompletedAt) redirect('/onboarding');

  // Admin-controlled global kill switch — if Google flags our AdSense
  // account, an admin can flip this without requiring a deploy.
  const adsEnabled = await getAdsEnabled();
  const showAds = profile.subscriptionTier === 'free' && adsEnabled;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary font-bold text-primary-foreground">
              E
            </span>
            <span className="hidden sm:inline">ExamReady<span className="text-primary">.ng</span></span>
          </Link>
          <nav className="hidden gap-1 md:flex" aria-label="Primary">
            <NavLink href="/dashboard" icon={Home}>
              Dashboard
            </NavLink>
            <NavLink href="/leaderboard" icon={Trophy}>
              Leaderboard
            </NavLink>
            <NavLink href="/groups" icon={Users}>
              Groups
            </NavLink>
            <NavLink href="/settings/notifications" icon={Settings}>
              Settings
            </NavLink>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="container flex-1 py-6 pb-24 md:pb-6">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background md:hidden"
        aria-label="Mobile primary"
      >
        <MobileTab href="/dashboard" icon={Home} label="Home" />
        <MobileTab href="/leaderboard" icon={Trophy} label="Rank" />
        <MobileTab href="/groups" icon={Users} label="Groups" />
        <MobileTab href="/settings/notifications" icon={Settings} label="Settings" />
      </nav>

      {showAds && <AdSenseScript />}
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Home;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-4 w-4" /> {children}
    </Link>
  );
}

function MobileTab({ href, icon: Icon, label }: { href: string; icon: typeof Home; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground">
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
