import { Card, CardContent } from '@examready/ui';
import Link from 'next/link';

export const metadata = {
  title: 'Frequently Asked Questions',
  description:
    'Honest answers about ExamReady.ng — pricing in Naira, working on slow networks, parental access, AI tutoring, and more.',
};

type FaqItem = { q: string; a: React.ReactNode };

const SECTIONS: Array<{ title: string; items: FaqItem[] }> = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'Does ExamReady work on 2G?',
        a: (
          <>
            Yes. The whole platform is built mobile-first for Nigerian networks. Practice questions
            and mock CBT exams cache to your phone the first time you load them, so you can keep
            practising even when the network drops. Results sync up when you reconnect.
          </>
        ),
      },
      {
        q: 'Can I use it without internet at all?',
        a: (
          <>
            Once a topic or mock exam is downloaded, you can practise it offline. Premium
            subscribers also get offline video lesson downloads. You&apos;ll need to come online
            once a day to sync your progress and get streak credit.
          </>
        ),
      },
      {
        q: 'How do I sign up?',
        a: (
          <>
            <Link href="/signup" className="text-primary underline">
              Tap here
            </Link>{' '}
            and enter your phone number. We&apos;ll WhatsApp you a 6-digit code. That&apos;s the
            whole signup — no email needed, no card.
          </>
        ),
      },
      {
        q: "What if I can't afford even Basic?",
        a: (
          <>
            Free tier covers a lot — past questions, daily practice, weekly summary, 5 AI tutor
            questions a day. If your family genuinely can&apos;t afford ₦2,500/month, apply for our
            bursary programme on the pricing page (launching in the next release). Real students get
            reviewed by a real human.
          </>
        ),
      },
    ],
  },
  {
    title: 'Pricing & payments',
    items: [
      {
        q: "How do I pay if I don't have a card?",
        a: (
          <>
            Paystack supports bank transfer, USSD (*737#, *894#, etc.), Opay, and PalmPay — not just
            cards. Pick whichever method works for you at checkout. We never ask for BVN.
          </>
        ),
      },
      {
        q: 'Can I cancel anytime?',
        a: (
          <>
            Yes. Go to{' '}
            <Link href="/settings/subscription" className="text-primary underline">
              Settings → Subscription
            </Link>{' '}
            and tap Cancel. Your access continues until the end of the period you&apos;ve already
            paid for, then drops to free tier — your data stays.
          </>
        ),
      },
      {
        q: 'Can I get a refund?',
        a: (
          <>
            New subscribers can request a full refund within 7 days of first payment, no questions
            asked. WhatsApp us from the contact page. After 7 days we review case-by-case.
          </>
        ),
      },
      {
        q: 'Why is the annual plan so much cheaper?',
        a: (
          <>
            Pro Annual is ₦25,000 — that&apos;s what you&apos;d pay for 5 months of Pro Monthly. We
            pass the saving on because annual subscribers cost us less in payment processing fees
            and predict our revenue better.
          </>
        ),
      },
    ],
  },
  {
    title: 'How it works',
    items: [
      {
        q: 'Is the AI tutor better than my school teacher?',
        a: (
          <>
            Different. Your teacher knows your name, your history, and your classroom context. Ready
            AI is patient, available at 2am, and never embarrassed by &quot;basic&quot; questions.
            Use both. The AI is best for follow-up explanations and exam-pattern questions — your
            teacher is best for fundamentals and feedback.
          </>
        ),
      },
      {
        q: 'How is this different from PrepClass / Passnownow / others?',
        a: (
          <>
            Three things. (1) AI tutor that explains questions in real Nigerian English, not just
            answer keys. (2) Ad-free Premium tier in Naira — most competitors only have free or
            very-expensive plans. (3) WhatsApp-first communication — daily reminders and weekly
            summaries land where Nigerian students actually check. We&apos;re also genuinely
            mobile-first; a lot of older platforms still feel like desktop sites.
          </>
        ),
      },
      {
        q: 'How accurate is the AI Examiner?',
        a: (
          <>
            The AI Examiner is trained on official WAEC and NECO marking schemes. In our internal
            testing it agrees with a human examiner within 1–2 marks per question on average. Treat
            it as a study tool, not a final verdict — always cross-check the marks against your
            teacher&apos;s feedback before exam day. It works best on essay-style questions where
            the marking guide has explicit point allocations.
          </>
        ),
      },
      {
        q: 'What is Predicted Score based on?',
        a: (
          <>
            Your practice attempts over the last 90 days, weighted by topic frequency in past
            papers, with a trend adjustment based on your last 14 days vs the full 90. We need at
            least 50 submitted answers on an exam before we&apos;ll predict — anything less is too
            small a sample to be meaningful. The band you see is a range (e.g. JAMB 280–310) so you
            can see both the floor and the ceiling of your current trajectory.
          </>
        ),
      },
      {
        q: 'Can I trust the predicted score?',
        a: (
          <>
            It&apos;s a guide, not a guarantee. Students who score above their prediction usually
            studied 20%+ more in their final 4 weeks; students who score below it usually plateau
            for the last month. The number is calibrated to historical scoring patterns — don&apos;t
            use it as the reason to relax, use it as the reason to focus on weak topics.
          </>
        ),
      },
      {
        q: 'Does AI Examiner work for JAMB?',
        a: (
          <>
            No. JAMB UTME is multiple-choice only — there&apos;s nothing for the AI Examiner to
            grade. AI Examiner is built for WAEC and NECO theory questions: English Language essays,
            Literature, Government, History, CRK answers. For JAMB, use the standard practice mode
            with explanations.
          </>
        ),
      },
      {
        q: 'Can I use AI Examiner for my school assignments?',
        a: (
          <>
            Not the primary use case, but it can work if your teacher&apos;s question matches the
            WAEC/NECO style — a clear question stem with a marking guide. We don&apos;t recommend
            using it instead of your teacher&apos;s own marking, because your teacher knows your
            class context. Use it before submitting an assignment to spot gaps, not as a substitute
            for human feedback.
          </>
        ),
      },
      {
        q: 'What happens if I miss my study reminder?',
        a: (
          <>
            Nothing punishing. Your streak might break, but you can come back any time and pick up
            where you left off. Streaks are there to encourage habit, not to make you anxious.
          </>
        ),
      },
    ],
  },
  {
    title: 'Privacy & safety',
    items: [
      {
        q: 'Is my data safe?',
        a: (
          <>
            We collect the minimum needed to help you pass — phone, name, age, exam target. No BVN,
            no NIN, no card numbers (those go directly to Paystack). Your practice data is yours;
            you can delete your account anytime from settings and everything goes with it. See our{' '}
            <Link href="/privacy" className="text-primary underline">
              privacy policy
            </Link>{' '}
            for the full breakdown.
          </>
        ),
      },
      {
        q: 'Will my parents see my activity?',
        a: (
          <>
            Only if you (or they) link your account to a parent account. Without linking, your study
            activity is private. Parent accounts are read-only — they see streaks and performance
            summaries, not the exact questions you answered.
          </>
        ),
      },
      {
        q: "I'm under 18. Are there any extra protections?",
        a: (
          <>
            Yes. Users 13–17 see only non-personalized contextual ads (no behavioural tracking). We
            don&apos;t allow private direct messages between students; study groups are moderated,
            group-chat only. We don&apos;t accept users under 13 at all.
          </>
        ),
      },
      {
        q: 'Do you sell my data?',
        a: (
          <>
            No. We make money from premium subscriptions and AdSense ads on the free tier — we
            don&apos;t sell student data and we never will.
          </>
        ),
      },
    ],
  },
  {
    title: 'Account & technical',
    items: [
      {
        q: 'I changed my phone number — how do I update it?',
        a: (
          <>
            For now, message us on WhatsApp and we&apos;ll do it manually after verifying you with
            your old number. Self-service phone change lands in a coming release.
          </>
        ),
      },
      {
        q: 'I lost access to my WhatsApp — how do I sign in?',
        a: (
          <>
            Tap &quot;Send via SMS&quot; on the OTP screen. If you no longer have access to the
            phone number entirely, message us on WhatsApp from a friend&apos;s phone with proof of
            identity (school ID + selfie holding it).
          </>
        ),
      },
      {
        q: 'What if I find a wrong answer or typo?',
        a: (
          <>
            Tap the flag icon on any question. Our team reviews flagged questions within a few days.
            If the answer was wrong, we update it and credit your account with extra Ready Points.
            We rely on student feedback to keep the bank accurate.
          </>
        ),
      },
      {
        q: 'How do I report a bug?',
        a: (
          <>
            WhatsApp us from the{' '}
            <Link href="/contact" className="text-primary underline">
              contact page
            </Link>
            . Premium subscribers get priority response. Include the page you were on and what you
            expected vs. what happened.
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="container max-w-3xl py-16">
      <h1 className="text-3xl font-bold tracking-tight">Frequently asked questions</h1>
      <p className="text-muted-foreground mt-3">
        Honest answers, no marketing fluff. Can&apos;t find what you&apos;re looking for?{' '}
        <Link href="/contact" className="text-primary underline">
          Message us on WhatsApp
        </Link>
        .
      </p>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-4 text-xl font-semibold">{section.title}</h2>
            <div className="space-y-3">
              {section.items.map((item) => (
                <Card key={item.q}>
                  <CardContent className="space-y-2 pt-6">
                    <p className="font-semibold">{item.q}</p>
                    <p className="text-muted-foreground text-sm">{item.a}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
