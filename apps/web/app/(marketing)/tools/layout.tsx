import Link from 'next/link';
import type { ReactNode } from 'react';

const TOOLS = [
  { href: '/tools/subject-combinations', title: 'JAMB Subject Combinations' },
  { href: '/tools/cgpa-calculator', title: 'CGPA Calculator' },
  { href: '/tools/cutoff-marks', title: 'Cut-off Marks' },
] as const;

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container max-w-5xl py-12">
      <nav className="mb-8 flex flex-wrap gap-2 border-b pb-4" aria-label="Free tools">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {tool.title}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
