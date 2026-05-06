import { PRICING, formatKoboAsNaira } from '@examready/shared';
import { Badge, Button, Card, CardContent } from '@examready/ui';
import { Check } from 'lucide-react';
import Link from 'next/link';


const plans = [
  {
    name: 'Free',
    price: '₦0',
    cadence: 'forever',
    description: 'Get started, no card needed.',
    features: [
      'Past questions for all subjects',
      '5 AI tutor questions per day',
      '1 mock CBT every 7 days',
      'Performance analytics',
      'Shows ads',
    ],
    cta: { href: '/signup', label: 'Start free' },
    accent: false,
  },
  {
    name: PRICING.basic_monthly.label,
    price: formatKoboAsNaira(PRICING.basic_monthly.amountKobo),
    cadence: '/ month',
    description: PRICING.basic_monthly.description,
    features: [
      'No ads',
      '20 AI tutor questions per day',
      'Unlimited mock CBT exams',
      'Detailed analytics',
      'Email support',
    ],
    cta: { href: '/signup?plan=basic_monthly', label: 'Choose Basic' },
    accent: false,
  },
  {
    name: PRICING.pro_monthly.label,
    price: formatKoboAsNaira(PRICING.pro_monthly.amountKobo),
    cadence: '/ month',
    description: PRICING.pro_monthly.description,
    features: [
      'Everything in Basic',
      'Unlimited AI tutor',
      'Offline downloads',
      'Priority WhatsApp support',
      '7-day free trial',
    ],
    cta: { href: '/signup?plan=pro_monthly', label: 'Try Pro free' },
    accent: true,
  },
  {
    name: PRICING.pro_annual.label,
    price: formatKoboAsNaira(PRICING.pro_annual.amountKobo),
    cadence: '/ year',
    description: 'Best value — pay once, save ~58%.',
    features: [
      'All Pro features',
      'One yearly payment',
      'Lock in current price',
    ],
    cta: { href: '/signup?plan=pro_annual', label: 'Choose annual' },
    accent: false,
  },
];

export default function PricingPage() {
  return (
    <div className="container py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple Naira pricing</h1>
        <p className="mt-3 text-muted-foreground">
          No USD anywhere. No hidden fees. Cancel anytime in your settings.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => (
          <Card key={p.name} className={p.accent ? 'border-primary shadow-md' : ''}>
            <CardContent className="flex h-full flex-col gap-4 pt-6">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{p.name}</p>
                {p.accent && <Badge>Most popular</Badge>}
              </div>
              <div>
                <span className="text-3xl font-bold">{p.price}</span>
                <span className="text-sm text-muted-foreground"> {p.cadence}</span>
              </div>
              <p className="text-sm text-muted-foreground">{p.description}</p>
              <ul className="space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                <Button asChild className="w-full" variant={p.accent ? 'default' : 'outline'}>
                  <Link href={p.cta.href}>{p.cta.label}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mx-auto mt-16 max-w-3xl rounded-lg border border-dashed bg-muted/30 p-6">
        <p className="font-semibold">Genuinely can&apos;t pay?</p>
        <p className="mt-2 text-sm text-muted-foreground">
          We have a bursary application for students whose family circumstances make even Basic out of reach. Apply once, our team reviews each request manually. Bursary applications open in the next release.
        </p>
      </div>
    </div>
  );
}
