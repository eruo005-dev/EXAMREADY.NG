import { Skeleton } from '@examready/ui';

export default function RootLoading() {
  return (
    <div className="container mx-auto space-y-4 p-6">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
