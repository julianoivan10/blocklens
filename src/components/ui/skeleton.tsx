import { cn } from '@/lib/utils';

/**
 * A placeholder shaped like the content it stands in for. The light
 * pass is defined once in globals.css and honours
 * prefers-reduced-motion by going still rather than flashing.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton rounded-xs', className)} {...props} />;
}

/** A placeholder for a set of register rows. */
export function RegisterSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line-faint">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-6 py-4">
          <Skeleton className="h-2 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      ))}
    </div>
  );
}
