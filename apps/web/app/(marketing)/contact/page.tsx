import { Button, Card, CardContent } from '@examready/ui';
import Link from 'next/link';


const WA_NUMBER = '2348012345678'; // Replace with real WhatsApp Business number
const WA_MESSAGE = encodeURIComponent("Hi, I'd like help with ExamReady.ng");

export default function ContactPage() {
  return (
    <div className="container max-w-2xl py-16">
      <h1 className="text-3xl font-bold tracking-tight">Get in touch</h1>
      <p className="mt-3 text-muted-foreground">
        We answer fastest on WhatsApp Business. Premium subscribers get priority response.
      </p>

      <div className="mt-10 grid gap-4">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="font-semibold">WhatsApp Business</p>
            <p className="text-sm text-muted-foreground">Tap to start a chat — typical response within an hour during business days.</p>
            <Button asChild>
              <Link href={`https://wa.me/${WA_NUMBER}?text=${WA_MESSAGE}`} target="_blank" rel="noopener noreferrer">
                Open WhatsApp
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="font-semibold">Email</p>
            <p className="text-sm text-muted-foreground">For longer-form questions or partnership requests.</p>
            <Button variant="outline" asChild>
              <Link href="mailto:hello@examready.ng">hello@examready.ng</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="font-semibold">Data Protection Officer</p>
            <p className="text-sm text-muted-foreground">
              Privacy questions, NDPR data requests, account deletion. Our DPO responds
              within 30 days as required by NDPR.
            </p>
            <Button variant="outline" asChild>
              <Link href="mailto:privacy@examready.ng">privacy@examready.ng</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
