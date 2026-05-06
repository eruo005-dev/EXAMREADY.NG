import { EmptyState } from '@examready/ui';
import { BookOpen } from 'lucide-react';

export default function QuestionsPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Questions</h1>
      <EmptyState
        icon={BookOpen}
        title="Question CRUD + bulk CSV import"
        description="Validate before insert, dedupe by stem, batch up to 5000 rows. Lands in admin sprint."
      />
    </div>
  );
}
