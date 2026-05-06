import { EmptyState } from '@examready/ui';
import { ShieldAlert } from 'lucide-react';

export default function ModerationPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Moderation</h1>
      <EmptyState icon={ShieldAlert} title="User-flagged content queue" description="Questions reported as wrong, group messages flagged. Lands in admin sprint." />
    </div>
  );
}
