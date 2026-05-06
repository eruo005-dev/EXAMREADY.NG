export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <article className="container max-w-3xl space-y-4 py-16 prose-sm">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2025</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What we collect</h2>
        <p className="text-muted-foreground">
          Phone number (required for sign-in), name, age, state, school, and the exams you&apos;re preparing for. We collect your practice answers and quiz results to power the analytics dashboard. We collect your notification preferences (WhatsApp / SMS / email opt-ins) and your preferred study time.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What we don&apos;t collect</h2>
        <p className="text-muted-foreground">
          BVN, NIN, bank account numbers, payment card details (entered directly into Paystack), or biometric data. We don&apos;t scrape your contacts or read your other apps.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Cookies & tracking</h2>
        <p className="text-muted-foreground">
          We use a session cookie for sign-in (essential, cannot be disabled). With your consent we additionally use PostHog for product analytics, Sentry for error tracking, and (free-tier users only) Google AdSense for display advertising. You can choose &ldquo;Essential only&rdquo; to opt out of analytics and ads from the consent banner.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Users under 18</h2>
        <p className="text-muted-foreground">
          Users under 13 cannot register. Users 13–17 see only non-personalized contextual ads (we tag ad requests with under-age-of-consent). We do not allow private direct messages between students; study groups are moderated.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your rights (NDPR)</h2>
        <p className="text-muted-foreground">
          You can request a copy of your data, correct it, or delete your account at any time. Email <a href="mailto:privacy@examready.ng" className="underline">privacy@examready.ng</a>. Deletion removes all associated practice history, payments, and notifications.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data location</h2>
        <p className="text-muted-foreground">
          Our database and storage are hosted with Supabase (EU region) and Cloudflare R2. We use Vercel for our application servers. By using ExamReady you consent to your data being processed in these locations.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="text-muted-foreground">
          Privacy questions: <a href="mailto:privacy@examready.ng" className="underline">privacy@examready.ng</a>. General support: <a href="/contact" className="underline">contact page</a>.
        </p>
      </section>
    </article>
  );
}
