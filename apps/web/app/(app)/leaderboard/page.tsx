import { Trophy } from 'lucide-react';

import { EmptyState } from '@examready/ui';

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Leaderboard</h1>
      <EmptyState
        icon={Trophy}
        title="Live leaderboards coming soon"
        description="School, state, and national rankings. Privacy-safe — first name + last initial only."
      />
    </div>
  );
}
