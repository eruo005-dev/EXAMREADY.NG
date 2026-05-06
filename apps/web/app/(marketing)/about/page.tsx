export default function AboutPage() {
  return (
    <article className="container max-w-3xl py-16">
      <h1 className="text-3xl font-bold tracking-tight">About ExamReady.ng</h1>
      <p className="mt-6 text-muted-foreground">
        ExamReady.ng was built because passing JAMB shouldn&apos;t depend on whether your family can afford private tutoring or thick prep textbooks. Every Nigerian student preparing for JAMB UTME, WAEC, NECO, GCE, Post-UTME, or NABTEB deserves the same caliber of practice — and access to it should be measured in Naira, not US dollars.
      </p>
      <h2 className="mt-10 text-xl font-semibold">What we believe</h2>
      <ul className="mt-4 space-y-3 text-muted-foreground">
        <li>
          <strong className="text-foreground">Practice beats theory.</strong> Real past questions, taken under real timing, beat any textbook. Our 50,000-question bank is built around this.
        </li>
        <li>
          <strong className="text-foreground">Mobile is not an afterthought.</strong> Most Nigerian students study on Android phones over patchy 3G. Every screen is designed at 360px first, every feature works offline.
        </li>
        <li>
          <strong className="text-foreground">Your data is yours.</strong> We collect the minimum needed to help you pass — phone, name, exam target. No BVN, no tracking beyond what we need to make the product better.
        </li>
        <li>
          <strong className="text-foreground">Students under 18 deserve more care.</strong> No private DMs, moderated study groups, no personalized ads for minors. Parents can link to their child&apos;s account.
        </li>
      </ul>
      <h2 className="mt-10 text-xl font-semibold">Made in Nigeria</h2>
      <p className="mt-4 text-muted-foreground">
        We&apos;re a small team. We pay our staff in Naira. Our payment gateway is Paystack. Our customer support runs on WhatsApp Business. We aren&apos;t building a Silicon Valley product translated for Nigeria — we&apos;re building for Nigeria from the ground up.
      </p>

      <h2 className="mt-10 text-xl font-semibold">From the founder</h2>
      {/* PLACEHOLDER: edit this paragraph with the real founder story before launch. */}
      <p className="mt-4 text-muted-foreground">
        I sat JAMB twice. The first time I scored 198 with a thick textbook and a tired tutor.
        The second time I scored 287 because I&apos;d worked through three years of past papers
        on a borrowed laptop in an internet café. The difference wasn&apos;t intelligence — it
        was access. ExamReady is the platform I needed back then: real past questions,
        explanations that actually explain, working offline on a cheap Android phone, billed
        in Naira. If we get this right, the next generation of Nigerian students won&apos;t need
        a prep café and a borrowed laptop to compete.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">— [Founder Name], CEO &amp; co-founder</p>
    </article>
  );
}
