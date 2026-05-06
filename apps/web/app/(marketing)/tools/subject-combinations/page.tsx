import { SubjectCombinationsLookup } from './SubjectCombinationsLookup';

export const metadata = {
  title: 'JAMB Subject Combinations 2026 — by Course',
  description:
    'Find the exact JAMB UTME subject combination required for your target course. Updated for 2026 admissions. Free tool, no signup.',
};

export default function SubjectCombinationsPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold tracking-tight">JAMB Subject Combinations</h1>
      <p className="mt-3 text-muted-foreground">
        Pick your course and we&apos;ll show you the exact JAMB UTME subjects you need to register
        for. English Language is compulsory for every course; the other 3 vary.
      </p>

      <SubjectCombinationsLookup />

      <section className="mt-12 prose-sm max-w-none text-muted-foreground">
        <h2 className="mt-10 text-xl font-semibold text-foreground">How JAMB subject combinations work</h2>
        <p className="mt-3">
          You write 4 JAMB UTME subjects. English Language is compulsory. The other 3 must
          match the requirements for your chosen course at your target university. Pick the
          wrong combination and your application will be rejected at registration — even if
          you score 380.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-foreground">Common mistakes to avoid</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Choosing Mathematics for an Arts course where Literature is required.</li>
          <li>Forgetting that some Medicine programmes need Physics + Chemistry + Biology, not Physics + Biology + something else.</li>
          <li>Assuming &quot;Government&quot; works for Law — many universities require Literature in English instead.</li>
          <li>Different universities sometimes have slightly different requirements for the same course. Cross-check on the JAMB e-Brochure.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-foreground">Source</h2>
        <p className="mt-3">
          This data is compiled from the JAMB e-Brochure (Brochure of Programmes / UTME).
          We update it annually. If you spot an error, message us on{' '}
          <a href="/contact" className="text-primary underline">WhatsApp</a> with the course
          name and the correct combination.
        </p>
      </section>
    </article>
  );
}
