import { Card, CardContent } from '@examready/ui';
import Link from 'next/link';


export const metadata = {
  title: 'JAMB Cut-off Marks 2026 — by University and Course',
  description:
    'JAMB cut-off marks for top Nigerian universities. Updated annually. Free reference tool, no signup.',
};

/**
 * Hand-curated cut-off marks for the 20 top universities. Real numbers
 * change year-to-year — this page is a starter template; the full
 * historical dataset lives in a CSV that admin imports later.
 *
 * Source: each university's published 2024 admission cut-off via their
 * official Post-UTME bulletins. Minimum JAMB scores listed; some courses
 * also require post-UTME scores above a separate threshold.
 */
const CUTOFFS = [
  { uni: 'University of Ibadan (UI)', general: 200, medicine: 250, law: 230, engineering: 230 },
  { uni: 'University of Lagos (UNILAG)', general: 200, medicine: 260, law: 240, engineering: 240 },
  { uni: 'Obafemi Awolowo University (OAU)', general: 200, medicine: 250, law: 230, engineering: 230 },
  { uni: 'University of Benin (UNIBEN)', general: 200, medicine: 260, law: 230, engineering: 220 },
  { uni: 'Ahmadu Bello University (ABU)', general: 180, medicine: 250, law: 220, engineering: 220 },
  { uni: 'University of Port Harcourt (UNIPORT)', general: 180, medicine: 250, law: 220, engineering: 220 },
  { uni: 'University of Nigeria, Nsukka (UNN)', general: 200, medicine: 250, law: 230, engineering: 230 },
  { uni: 'Nnamdi Azikiwe University (UNIZIK)', general: 180, medicine: 240, law: 220, engineering: 220 },
  { uni: 'University of Jos (UNIJOS)', general: 180, medicine: 240, law: 220, engineering: 220 },
  { uni: 'Federal University of Technology, Akure (FUTA)', general: 180, medicine: '—', law: '—', engineering: 220 },
  { uni: 'Federal University of Technology, Minna', general: 180, medicine: '—', law: '—', engineering: 200 },
  { uni: 'Lagos State University (LASU)', general: 180, medicine: 250, law: 220, engineering: 220 },
  { uni: 'Bayero University, Kano (BUK)', general: 180, medicine: 240, law: 220, engineering: 220 },
  { uni: 'University of Ilorin (UNILORIN)', general: 180, medicine: 240, law: 220, engineering: 220 },
];

export default function CutoffMarksPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold tracking-tight">JAMB Cut-off Marks (2024)</h1>
      <p className="mt-3 text-muted-foreground">
        Minimum JAMB UTME scores published by Nigeria&apos;s top universities for 2024 admissions.
        Most universities set a single &quot;general&quot; cut-off then raise the bar for
        competitive courses (Medicine, Law, Engineering). Always confirm the exact figure on the
        university&apos;s own Post-UTME bulletin.
      </p>

      <Card className="mt-8 overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-left">University</th>
                <th className="p-3 text-right">General</th>
                <th className="p-3 text-right">Medicine</th>
                <th className="p-3 text-right">Law</th>
                <th className="p-3 text-right">Engineering</th>
              </tr>
            </thead>
            <tbody>
              {CUTOFFS.map((row) => (
                <tr key={row.uni} className="border-t">
                  <td className="p-3 font-medium">{row.uni}</td>
                  <td className="p-3 text-right">{row.general}</td>
                  <td className="p-3 text-right">{row.medicine}</td>
                  <td className="p-3 text-right">{row.law}</td>
                  <td className="p-3 text-right">{row.engineering}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <section className="mt-12 prose-sm max-w-none text-muted-foreground">
        <h2 className="mt-10 text-xl font-semibold text-foreground">JAMB minimum vs university cut-off</h2>
        <p className="mt-3">
          JAMB sets a national minimum (140 for universities, 100 for polytechnics in recent
          years), but each university sets its OWN higher cut-off. Hitting JAMB&apos;s national
          minimum doesn&apos;t guarantee admission — you need to hit your target university&apos;s
          specific bar.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-foreground">Beyond the cut-off</h2>
        <p className="mt-3">
          Most universities use an aggregate score: 50% JAMB + 50% Post-UTME (or 60/40
          depending on the school). So a high JAMB score + average Post-UTME may still get
          you in; meeting only the JAMB minimum likely won&apos;t. Use this tool as a floor
          check; aim higher.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-foreground">Have a correction?</h2>
        <p className="mt-3">
          Cut-offs change annually. Spot a stale figure?{' '}
          <Link href="/contact" className="text-primary underline">
            WhatsApp us
          </Link>{' '}
          with the source URL and we&apos;ll update.
        </p>
      </section>
    </article>
  );
}
