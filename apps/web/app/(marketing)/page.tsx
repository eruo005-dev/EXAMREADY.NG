import Link from 'next/link';
import { ArrowRight, BookOpen, MessageCircle, Shield, Trophy, Wifi } from 'lucide-react';

import { Badge, Button, Card, CardContent } from '@examready/ui';

const exams = ['JAMB UTME', 'WAEC', 'NECO', 'Post-UTME', 'GCE', 'NABTEB', 'JUPEB'];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-background to-muted/30">
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              🇳🇬 Trusted by Nigerian students
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Pass <span className="text-primary">JAMB, WAEC, NECO</span> with confidence
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              AI-powered practice, real past questions, and full mock CBT exams — all in Naira, all built for Nigerian networks. Works on 2G.
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
            <p className="mt-4 text-xs text-muted-foreground">
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
                  <Icon className="h-6 w-6 text-primary" />
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
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
            <p className="mt-3 text-muted-foreground">
              Built with Nigerian students who&apos;ve walked the JAMB hall before.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: '50,000+ questions', body: 'JAMB, WAEC, NECO, Post-UTME — categorised, tagged, with detailed explanations.' },
              { title: 'AI tutor "Ready AI"', body: 'Ask any question, get a clear step-by-step explanation. Free tier: 5 a day.' },
              { title: 'Mock CBT exams', body: 'JAMB-accurate timer and UI. Practice the real thing before exam day.' },
              { title: 'Adaptive learning', body: 'Difficulty adjusts to you. Focus your time on the topics you\'re weakest in.' },
              { title: 'Performance analytics', body: 'Weak topics heatmap, predicted exam score, weekly summary on WhatsApp.' },
              { title: 'Study groups', body: 'Compete with classmates on private leaderboards. Moderated, safe.' },
            ].map(({ title, body }) => (
              <Card key={title}>
                <CardContent className="space-y-2 pt-6">
                  <Trophy className="h-5 w-5 text-accent" />
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="container py-16">
          <div className="mx-auto max-w-2xl rounded-2xl bg-primary p-10 text-center text-primary-foreground">
            <h2 className="text-3xl font-bold">Your exam is closer than you think.</h2>
            <p className="mt-3 text-primary-foreground/80">
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
