import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/format';
import { AssetMark } from './asset-mark';
import { Delta } from './delta';

interface AssetRowProps {
  symbol: string;
  name: string;
  price?: number;
  change?: number;
  /** Small ordinal shown at the left, e.g. a rank or list index. */
  index?: number;
  className?: string;
}

/**
 * One asset in a list. A hairline-divided row that reveals its
 * affordance on hover through a ground shift and a signal rule at the
 * leading edge — not a card that lifts.
 */
export function AssetRow({
  symbol,
  name,
  price,
  change,
  index,
  className,
}: AssetRowProps) {
  return (
    <Link
      href={`/research/${symbol.toUpperCase()}`}
      className={cn(
        'group relative flex items-center gap-4 py-3 pl-4 pr-1 transition-colors duration-200',
        'hover:bg-panel/60',
        className
      )}
    >
      {/* Leading signal rule: the hover affordance. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-px origin-top scale-y-0 bg-signal transition-transform duration-300 ease-out-quint group-hover:scale-y-100"
      />

      {index !== undefined && (
        <span className="t-micro-tight w-5 shrink-0 text-ink-ghost">
          {String(index).padStart(2, '0')}
        </span>
      )}

      <AssetMark symbol={symbol} size="sm" />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[0.875rem] font-medium text-ink">{name}</span>
        <span className="t-micro-tight">{symbol.toUpperCase()}</span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {price !== undefined && (
          <span className="t-figure text-[0.8125rem]">{formatPrice(price)}</span>
        )}
        {change !== undefined && <Delta value={change} size="sm" />}
      </span>
    </Link>
  );
}

/** A hairline-divided list of asset rows. */
export function AssetList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col [&>*+*]:border-t [&>*+*]:border-line-faint', className)}>
      {children}
    </div>
  );
}
