import { EmptyState } from '@examready/ui';
import { Megaphone } from 'lucide-react';

export default function BroadcastsPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Broadcasts</h1>
      <EmptyState icon={Megaphone} title="WhatsApp broadcast composer" description="Segment by exam, location, tier, exam date. Honors per-user opt-outs. Lands in admin sprint." />
    </div>
  );
}
