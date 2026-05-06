import { EmptyState } from '@examready/ui';
import { Users } from 'lucide-react';

export default function UsersPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Users</h1>
      <EmptyState icon={Users} title="User management" description="Search, view profile, override subscription, refund payment. Lands in admin sprint." />
    </div>
  );
}
