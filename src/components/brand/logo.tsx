import { cn } from '@/lib/utils';

/**
 * The BlockLens mark: an aperture over a block, with registration
 * ticks. It reads as an instrument pointed at a unit of data, which is
 * what the product does — drawn in hairlines so it belongs to the same
 * vocabulary as the rest of the interface.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={cn('size-5', className)}
    >
      {/* the block */}
      <rect
        x="1.5"
        y="1.5"
        width="17"
        height="17"
        stroke="currentColor"
        strokeOpacity="0.45"
      />
      {/* the aperture */}
      <circle cx="10" cy="10" r="5" stroke="currentColor" strokeOpacity="0.9" />
      {/* the reading */}
      <circle cx="10" cy="10" r="1.75" fill="currentColor" />
      {/* registration ticks */}
      <path
        d="M10 1.5v2.25M10 16.25v2.25M1.5 10h2.25M16.25 10h2.25"
        stroke="currentColor"
        strokeOpacity="0.7"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={cn('text-signal', markClassName)} />
      <span className="text-[0.9375rem] tracking-[-0.01em]">
        <span className="font-medium text-ink">Block</span>
        <span className="font-normal text-ink-dim">Lens</span>
      </span>
    </span>
  );
}
