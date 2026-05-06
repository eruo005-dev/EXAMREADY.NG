import { Users } from 'lucide-react';

import { EmptyState } from '@examready/ui';

export default function GroupsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Study Groups</h1>
      <EmptyState
        icon={Users}
        title="Study groups land soon"
        description="Private rooms with shared mock exams. Moderated, no DMs — safe for students under 18."
      />
    </div>
  );
}
