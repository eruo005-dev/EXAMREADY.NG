import { Card, CardContent } from '@examready/ui';

export const metadata = {
  title: 'Cookie Policy',
  description: 'What cookies ExamReady.ng sets, why, and how to opt out.',
};

type CookieEntry = {
  name: string;
  setBy: string;
  purpose: string;
  duration: string;
  category: 'Necessary' | 'Analytics' | 'Advertising';
};

const COOKIES: CookieEntry[] = [
  {
    name: 'sb-<project-ref>-auth-token',
    setBy: 'ExamReady.ng (via Supabase)',
    purpose: 'Keeps you signed in. Without this, every page requires re-login.',
    duration: '7 days (refreshed on activity)',
    category: 'Necessary',
  },
  {
    name: 'examready.ndpr.consent.v2',
    setBy: 'ExamReady.ng (localStorage, not technically a cookie)',
    purpose: 'Stores your consent decision so we don\'t ask again on every visit.',
    duration: 'Until you clear browser storage',
    category: 'Necessary',
  },
  {
    name: 'examready.session',
    setBy: 'ExamReady.ng (sessionStorage)',
    purpose: 'Anonymous session id for tying analytics events together within one browsing session.',
    duration: 'Tab close',
    category: 'Necessary',
  },
  {
    name: 'ph_<distinct-id>_posthog',
    setBy: 'PostHog',
    purpose: 'Product analytics — tracks which features you use so we can fix bugs and improve. No PII.',
    duration: '1 year',
    category: 'Analytics',
  },
  {
    name: '__cf_bm',
    setBy: 'Cloudflare',
    purpose: 'Bot protection on API endpoints. Distinguishes humans from automated traffic.',
    duration: '30 minutes',
    category: 'Necessary',
  },
  {
    name: '__Secure-3PAPISID, NID, etc.',
    setBy: 'Google AdSense',
    purpose: 'Ad personalization for free-tier users 18+ (not set for under-18s — non-personalized only).',
    duration: '1–2 years',
    category: 'Advertising',
  },
  {
    name: 'IDE',
    setBy: 'Google DoubleClick',
    purpose: 'AdSense fraud prevention and ad rotation.',
    duration: '1 year',
    category: 'Advertising',
  },
];

export default function CookiesPage() {
  return (
    <article className="container max-w-3xl space-y-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Cookie Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026</p>

      <p className="text-muted-foreground">
        We use cookies and similar technologies (localStorage, sessionStorage) to make
        ExamReady work. Some are required for sign-in and security; others are optional and
        only load if you agree via the consent banner. You can change your choices anytime
        in <a href="/settings/notifications" className="underline">settings</a> or by clearing
        the <code>examready.ndpr.consent.v2</code> entry from your browser&apos;s site data.
      </p>

      <h2 className="mt-8 text-xl font-semibold">What we set</h2>

      <div className="space-y-3">
        {COOKIES.map((c) => (
          <Card key={c.name}>
            <CardContent className="space-y-2 pt-6 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="font-mono text-xs">{c.name}</code>
                <span className="text-xs text-muted-foreground">{c.category}</span>
              </div>
              <p className="text-muted-foreground"><strong>Set by:</strong> {c.setBy}</p>
              <p className="text-muted-foreground"><strong>Purpose:</strong> {c.purpose}</p>
              <p className="text-muted-foreground"><strong>Duration:</strong> {c.duration}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 text-xl font-semibold">How to opt out</h2>
      <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
        <li>
          <strong>Reject the consent banner:</strong> &quot;Reject non-essential&quot; means we
          set only the necessary cookies. Analytics and Advertising will not load.
        </li>
        <li>
          <strong>Clear browser storage:</strong> in your browser settings, clear cookies for{' '}
          <code>examready.ng</code>. The next visit you&apos;ll see the consent banner again.
        </li>
        <li>
          <strong>Browser-wide opt-out:</strong> &quot;Do Not Track&quot; signals, Privacy
          Badger, or uBlock Origin will all block our analytics cookies. We don&apos;t fight
          this — it&apos;s your data.
        </li>
        <li>
          <strong>AdSense personalization opt-out:</strong> Google&apos;s{' '}
          <a
            href="https://myadcenter.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Ad Center
          </a>{' '}
          lets you control ad personalization across all sites that use AdSense.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">Children</h2>
      <p className="text-muted-foreground">
        Users under 13 cannot register on ExamReady. Users 13–17 are tagged{' '}
        <code>data-tag-for-under-age-of-consent</code> in every AdSense request, which forces
        non-personalized contextual ads only — no behavioural tracking, no advertising
        cookies for cross-site profile building.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Contact</h2>
      <p className="text-muted-foreground">
        Questions about cookies or your data:{' '}
        <a href="mailto:privacy@examready.ng" className="underline">privacy@examready.ng</a>.
      </p>
    </article>
  );
}
