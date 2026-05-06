import { Sparkles } from 'lucide-react';

import { EmptyState } from '@examready/ui';

export default function AiTutorPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Ready AI</h1>
      <EmptyState
        icon={Sparkles}
        title="Ready AI lands soon"
        description="Ask any question, get a step-by-step explanation. Free tier: 5 questions/day, Premium: unlimited."
      />
    </div>
  );
}
