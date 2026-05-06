import { CgpaCalculator } from './CgpaCalculator';

export const metadata = {
  title: 'Nigerian University CGPA Calculator (4.0 + 5.0 scales)',
  description:
    'Calculate your CGPA for any Nigerian university. Supports both 4.0 and 5.0 grading scales, includes class-of-degree thresholds. Free, no signup.',
};

export default function CgpaCalculatorPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold tracking-tight">CGPA Calculator</h1>
      <p className="mt-3 text-muted-foreground">
        Enter each course&apos;s grade and credit unit. Tool calculates your GPA for the
        semester and your projected class of degree. Switch between 4.0 and 5.0 scales —
        most Nigerian universities use 5.0; UI uses 7.0 (we don&apos;t support that yet).
      </p>

      <CgpaCalculator />

      <section className="mt-12 prose-sm max-w-none text-muted-foreground">
        <h2 className="mt-10 text-xl font-semibold text-foreground">Class of degree thresholds</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left">Class</th>
              <th className="py-2 text-right">5.0 scale</th>
              <th className="py-2 text-right">4.0 scale</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2">First Class</td>
              <td className="py-2 text-right">4.50 – 5.00</td>
              <td className="py-2 text-right">3.50 – 4.00</td>
            </tr>
            <tr className="border-b">
              <td className="py-2">Second Class Upper (2:1)</td>
              <td className="py-2 text-right">3.50 – 4.49</td>
              <td className="py-2 text-right">3.00 – 3.49</td>
            </tr>
            <tr className="border-b">
              <td className="py-2">Second Class Lower (2:2)</td>
              <td className="py-2 text-right">2.40 – 3.49</td>
              <td className="py-2 text-right">2.00 – 2.99</td>
            </tr>
            <tr className="border-b">
              <td className="py-2">Third Class</td>
              <td className="py-2 text-right">1.50 – 2.39</td>
              <td className="py-2 text-right">1.00 – 1.99</td>
            </tr>
            <tr>
              <td className="py-2">Pass</td>
              <td className="py-2 text-right">1.00 – 1.49</td>
              <td className="py-2 text-right">— (most schools fail below 1.0)</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-xs">
          Some universities (UI, OAU) use a 7.0 grading scale. We don&apos;t support that yet —
          coming in a future update.
        </p>
      </section>
    </article>
  );
}
