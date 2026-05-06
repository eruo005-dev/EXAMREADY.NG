import { Video } from 'lucide-react';

import { EmptyState } from '@examready/ui';

export default function VideosPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-bold">Video Lessons</h1>
      <EmptyState
        icon={Video}
        title="Video library coming soon"
        description="Curriculum-mapped lessons with transcripts and notes. Premium subscribers get offline downloads."
      />
    </div>
  );
}
