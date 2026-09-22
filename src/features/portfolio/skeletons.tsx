import { Skeleton } from '@/components/ui/skeleton';

/** Placeholders shaped like the sections they stand in for, so nothing jumps when data arrives. */

export function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading holdings">
      <div className="flex flex-col gap-8 border-b border-line pb-10 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-2 w-40" />
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-2 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-2 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-12 flex flex-col gap-3">
        <Skeleton className="h-2 w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

export function PerformanceSkeleton() {
  return (
    <div className="mt-16 flex flex-col gap-6" aria-busy="true" aria-label="Loading performance">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-[240px] w-full" />
      <Skeleton className="h-[240px] w-full" />
    </div>
  );
}

export function InsightsSkeleton() {
  return (
    <div className="mt-16 flex flex-col gap-3" aria-busy="true" aria-label="Loading insights">
      <Skeleton className="h-2 w-24" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
