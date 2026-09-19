import { cn } from '@/lib/utils';
import { formatPercentage } from '@/lib/format';

type DeltaSize = 'sm' | 'md' | 'lg';

interface DeltaProps {
  /** Percentage change. Sign determines direction. */
  value: number;
  size?: DeltaSize;
  /** Show the ▲/▼ glyph. Keep it on wherever colour carries meaning. */
  glyph?: boolean;
  className?: string;
}

const SIZES: Record<DeltaSize, string> = {
  sm: 'text-[0.6875rem]',
  md: 'text-[0.8125rem]',
  lg: 'text-[0.9375rem]',
};

/**
 * A signed change.
 *
 * Direction is carried by three channels — the glyph, the explicit
 * sign in the number, and colour — so the value never depends on
 * colour alone. The neutral case is deliberately not green.
 */
export function Delta({ value, size = 'md', glyph = true, className }: DeltaProps) {
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';

  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 font-mono tabular-nums',
        SIZES[size],
        direction === 'up' && 'text-up',
        direction === 'down' && 'text-down',
        direction === 'flat' && 'text-ink-faint',
        className
      )}
    >
      {glyph && (
        <span aria-hidden="true" className="text-[0.75em] leading-none">
          {direction === 'up' ? '▲' : direction === 'down' ? '▼' : '–'}
        </span>
      )}
      {formatPercentage(value)}
    </span>
  );
}

/**
 * A qualitative state. Ships with a text label always, so the state
 * is never communicated by colour alone.
 */
export function StatusDot({
  tone,
  label,
  className,
}: {
  tone: 'up' | 'down' | 'caution' | 'neutral' | 'signal';
  label: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          tone === 'up' && 'bg-up',
          tone === 'down' && 'bg-down',
          tone === 'caution' && 'bg-caution',
          tone === 'signal' && 'bg-signal',
          tone === 'neutral' && 'bg-ink-ghost'
        )}
      />
      <span className="t-micro-tight">{label}</span>
    </span>
  );
}
