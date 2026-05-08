/**
 * /cbt/keyboard-help — printable cheat sheet of the JAMB CBT keyboard
 * navigation.
 *
 * Linked from the CBT runner's settings + offered as a one-time tip
 * the first time a candidate opens any CBT attempt. Reachable
 * directly from the marketing site so prospective users can preview
 * the UX before signing up.
 */
import Link from 'next/link';

export const metadata = {
  title: 'CBT Keyboard Shortcuts — ExamReady',
  description:
    'Every key the JAMB CBT exam interface uses, mirrored exactly on ExamReady. Practice your keyboard reflexes before the real test.',
};

const KEYS = [
  { key: 'A / B / C / D', what: 'Pick option A, B, C, or D' },
  { key: 'P', what: 'Previous question' },
  { key: 'N', what: 'Next question' },
  { key: 'R', what: 'Reverse / clear current selection' },
  { key: 'K', what: 'Toggle calculator (avoids C — that is option-C)' },
  { key: 'S', what: 'Submit attempt (with confirmation)' },
  { key: 'F', what: 'Flag current question for review (ExamReady extension)' },
];

export default function KeyboardHelpPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">CBT keyboard shortcuts</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        ExamReady mirrors the official JAMB CBT keyboard layout 1:1. Practising with these keys
        means no surprises on exam day.
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-2 font-medium">Key</th>
              <th className="px-4 py-2 font-medium">What it does</th>
            </tr>
          </thead>
          <tbody>
            {KEYS.map((row) => (
              <tr key={row.key} className="border-t border-slate-200">
                <td className="px-4 py-3 font-mono text-base font-semibold">{row.key}</td>
                <td className="px-4 py-3">{row.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-sm text-slate-600">
        Want to feel it? Start a free practice mock from your{' '}
        <Link className="text-blue-600 underline" href="/dashboard">
          dashboard
        </Link>
        .
      </p>
    </main>
  );
}
