import { EmptyState } from '@examready/ui';
import { CreditCard } from 'lucide-react';

export default function SubscriptionSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Subscription</h1>
      <EmptyState
        icon={CreditCard}
        title="Coming soon"
        description="Self-service plan management lands in the next release. To upgrade or cancel today, message us on WhatsApp from the contact page."
      />
    </div>
  );
}
