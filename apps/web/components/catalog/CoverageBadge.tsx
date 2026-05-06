/**
 * CoverageBadge — small visual marker for an exam's coverage_status.
 *
 * Sprint 6 introduced 'beta' (visible-but-early-access) and 'hidden'
 * (catalog-omitted). This badge is shown on the exam landing page,
 * practice mode pages, and the dashboard so students know what they're
 * looking at:
 *  - 'live'        → no badge (the default; standard catalog presentation)
 *  - 'beta'        → BETA badge with tooltip "Content growing weekly"
 *  - 'coming_soon' → SOON badge (only used on /coming-soon, where the
 *                    page itself signals waitlist mode)
 *  - 'planned' / 'hidden' → never rendered (these don't appear in UI)
 */
import { Badge } from '@examready/ui';

export type CoverageStatus = 'live' | 'beta' | 'coming_soon' | 'planned' | 'hidden';

export type CoverageBadgeProps = {
  status: CoverageStatus;
  /** When true, render the longer explainer copy alongside the badge. */
  withExplainer?: boolean;
  className?: string;
};

export function CoverageBadge({ status, withExplainer, className }: CoverageBadgeProps) {
  if (status === 'live' || status === 'planned' || status === 'hidden') return null;

  if (status === 'beta') {
    return (
      <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
        <Badge
          variant="secondary"
          className="border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          title="Beta — content is growing weekly"
        >
          BETA
        </Badge>
        {withExplainer && (
          <span className="text-muted-foreground text-xs">
            Content growing weekly. Question pool is smaller than our live exams.
          </span>
        )}
      </span>
    );
  }

  // coming_soon
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <Badge variant="outline" title="Coming soon — join the waitlist">
        COMING SOON
      </Badge>
      {withExplainer && (
        <span className="text-muted-foreground text-xs">
          Not available yet — join the waitlist to be notified when it launches.
        </span>
      )}
    </span>
  );
}
