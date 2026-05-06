import { Badge, Button, Card, CardContent } from '@examready/ui';
import { ArrowRight, BookOpen, MessageCircle, Shield, Trophy, Wifi } from 'lucide-react';
import Link from 'next/link';

const exams = ['JAMB UTME', 'WAEC', 'NECO', 'Post-UTME', 'GCE', 'NABTEB', 'JUPEB'];

/**
 * Sprint 6 hero copy variants. The default (index 0) ships; the others
 * are kept inline so a future A/B test wires up by reading
 * NEXT_PUBLIC_HERO_VARIANT from PostHog feature flags. The user picks
 * the winner based on signup conversion.
 */
const HERO_HEADLINES = [
  'Get exam-grade feedback before you sit the exam.',
  'Know your JAMB score before JAMB does.',
  'The only platform that grades you like WAEC will.',
] as const;

const ACTIVE_HERO_VARIANT = 0;

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="from-background to-muted/30 border-b bg-gradient-to-b">
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              🇳🇬 Trusted by Nigerian students
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              {HERO_HEADLINES[ACTIVE_HERO_VARIANT]}
            </h1>
            <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg">
              AI Examiner grades your WAEC theory answers like a real marker. Predicted Score tells
              you what you&apos;d get if your exam were today. Real past questions, full mock CBT,
              all in Naira, built for Nigerian networks.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-4 text-xs">
              7-day free Pro trial · No card required · Naira-only pricing
            </p>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
            {exams.map((e) => (
              <Badge key={e} variant="outline">
                {e}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="border-b">
        <div className="container py-12">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Shield,
                title: 'Safe for students',
                body: 'No private DMs, moderated study groups, minimal ads. Built defensively for users 13–17.',
              },
              {
                icon: Wifi,
                title: 'Works on 2G',
                body: 'Practice questions cache offline. Mock exams sync results when you reconnect.',
              },
              {
                icon: MessageCircle,
                title: 'WhatsApp first',
                body: 'Sign in via WhatsApp, get reminders on WhatsApp, share with friends in one tap.',
              },
              {
                icon: BookOpen,
                title: 'Real past questions',
                body: '2019–2024 JAMB, WAEC, NECO papers with full explanations.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <Card key={title}>
                <CardContent className="space-y-2 pt-6">
                  <Icon className="text-primary h-6 w-6" />
                  <p className="font-semibold">{title}</p>
                  <p className="text-muted-foreground text-sm">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b">
        <div className="container py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Everything you need to pass</h2>
            <p className="text-muted-foreground mt-3">
              Built with Nigerian students who&apos;ve walked the JAMB hall before.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'AI Examiner',
                body: 'Grades your theory answers like a real WAEC marker — per-criterion marks, specific feedback, three things to fix. Built for English Language, Literature, Government, History, CRK.',
                badge: 'NEW',
              },
              {
                title: 'Predicted Score',
                body: 'Knows what you’d score in JAMB / WAEC / NECO if your exam were today, weighted by topic importance and your last-90-day trend. Updates as you practice.',
                badge: 'NEW',
              },
              {
                title: 'Mock CBT exams',
                body: 'JAMB-accurate timer and UI. Practice the real thing before exam day.',
              },
              {
                title: 'Past questions',
                body: 'JAMB UTME (live), WAEC SSCE + NECO SSCE (beta) — categorised, tagged, with detailed explanations.',
              },
              {
                title: 'AI tutor "Ready AI"',
                body: 'Ask any question, get a clear step-by-step explanation. Free tier: 5 a day.',
              },
              {
                title: 'Adaptive practice',
                body: 'Difficulty adjusts to you. Focus your time on the topics you’re weakest in.',
              },
            ].map(({ title, body, badge }) => (
              <Card key={title}>
                <CardContent className="space-y-2 pt-6">
                  <div className="flex items-center gap-2">
                    <Trophy className="text-accent h-5 w-5" />
                    {badge && (
                      <Badge variant="secondary" className="text-[10px]">
                        {badge}
                      </Badge>
                    )}
                  </div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-muted-foreground text-sm">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="container py-16">
          <div className="bg-primary text-primary-foreground mx-auto max-w-2xl rounded-2xl p-10 text-center">
            <h2 className="text-3xl font-bold">Your exam is closer than you think.</h2>
            <p className="text-primary-foreground/80 mt-3">
              Start free today. Upgrade later — or never. Naira-only pricing, no surprises.
            </p>
            <Button size="lg" variant="secondary" className="mt-6" asChild>
              <Link href="/signup">Get started free</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
