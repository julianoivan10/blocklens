import { Container } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <Container className="py-8 sm:py-10">
      <div className="mb-10 flex flex-col gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-2 w-72" />
      </div>
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </Container>
  );
}
