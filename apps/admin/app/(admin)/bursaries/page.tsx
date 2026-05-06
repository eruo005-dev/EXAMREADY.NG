import { EmptyState } from '@examready/ui';
import { Heart } from 'lucide-react';

export default function BursariesPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Bursary Applications</h1>
      <EmptyState icon={Heart} title="Bursary review queue" description="Manual review of applications from students who can't afford Basic. Lands in admin sprint." />
    </div>
  );
}
