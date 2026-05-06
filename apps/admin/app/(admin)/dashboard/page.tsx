import { EmptyState } from '@examready/ui';
import { LayoutDashboard } from 'lucide-react';

export default function AdminDashboard() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Overview</h1>
      <EmptyState
        icon={LayoutDashboard}
        title="Admin dashboard coming soon"
        description="DAU/MAU, retention cohorts, revenue, churn, AdSense revenue (manual entry). Sprint 0 ships the shell only."
      />
    </div>
  );
}
