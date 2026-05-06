export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <article className="container max-w-3xl space-y-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2025</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">1. Who can use ExamReady</h2>
        <p className="text-muted-foreground">
          You must be 13 or older. If you are under 18, your parent or guardian agrees to these terms on your behalf. Account creation under 13 is prohibited.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">2. Subscription billing</h2>
        <p className="text-muted-foreground">
          Premium plans are billed in Naira via Paystack. Recurring charges renew automatically until cancelled. You can cancel any time in your settings — access continues until the end of the current billing period.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">3. Ready Points are not money</h2>
        <p className="text-muted-foreground">
          Ready Points are a status feature only. They cannot be redeemed for cash, gift cards, or any monetary value, transferred to other users, or exchanged for refunds. They have no value and are not refundable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">4. Acceptable use</h2>
        <p className="text-muted-foreground">
          Don&apos;t share your account, scrape our content, or attempt to extract correct answers in bulk. Don&apos;t use the AI tutor for non-academic purposes. Don&apos;t harass other users in study groups — moderators can remove anyone violating community guidelines.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">5. Refunds</h2>
        <p className="text-muted-foreground">
          New subscribers can request a full refund within 7 days of first payment for any reason. After 7 days, refunds are reviewed case-by-case. Annual subscribers who cancel mid-year forfeit the remaining balance.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">6. Content accuracy</h2>
        <p className="text-muted-foreground">
          We do our best to provide accurate past questions and explanations, but we make no warranty that any specific question will or won&apos;t appear in your exam. Use our analytics as guidance, not a guarantee.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">7. Termination</h2>
        <p className="text-muted-foreground">
          We may suspend or terminate accounts for violations of these terms, fraudulent payment, or abuse of staff. You can delete your account from settings at any time.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">8. Governing law</h2>
        <p className="text-muted-foreground">
          These terms are governed by the laws of the Federal Republic of Nigeria.
        </p>
      </section>
    </article>
  );
}
