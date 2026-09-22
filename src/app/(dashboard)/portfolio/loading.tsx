import { Container } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';
import { OverviewSkeleton } from '@/features/portfolio/skeletons';

/** Shown instantly on navigation, before the session check resolves. */
export default function Loading() {
  return (
    <Container className="py-8 sm:py-10">
      <div className="mb-10 flex flex-col gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-2 w-64" />
      </div>
      <OverviewSkeleton />
    </Container>
  );
}
