import { cn } from '@/lib/utils';
import { Delta } from './delta';

/**
 * A register is an instrument readout: label-value pairs on a shared
 * baseline grid, divided by hairlines. It is the default way to
 * present a set of metrics in BlockLens — no borders, no boxes, just
 * alignment and rules.
 */
export function Register({
  children,
  className,
  columns = 1,
}: {
  children: React.ReactNode;
  className?: string;
  columns?: 1 | 2;
}) {
  return (
    <dl
      className={cn(
        columns === 2
          ? 'grid grid-cols-1 gap-x-10 sm:grid-cols-2'
          : 'flex flex-col',
        // Hairline between rows. In two columns each column rules
        // independently, so the first row of column two is not
        // double-ruled.
        columns === 2
          ? '[&>*]:border-t [&>*]:border-line-faint sm:[&>*:nth-child(2)]:border-t-0 [&>*:first-child]:border-t-0'
          : '[&>*+*]:border-t [&>*+*]:border-line-faint',
        className
      )}
    >
      {children}
    </dl>
  );
}

interface RegisterRowProps {
  label: string;
  value: React.ReactNode;
  change?: number;
  /** A short qualifier shown under the label. */
  note?: string;
  className?: string;
}

export function RegisterRow({ label, value, change, note, className }: RegisterRowProps) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-6 py-3.5',
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="t-micro-tight text-ink-faint">{label}</dt>
        {note && <span className="text-[0.6875rem] text-ink-ghost">{note}</span>}
      </div>
      <dd className="flex shrink-0 items-baseline gap-3">
        {change !== undefined && <Delta value={change} size="sm" />}
        <span className="t-figure">{value}</span>
      </dd>
    </div>
  );
}

/**
 * A meter. The track is neutral; the fill carries the reading. Paired
 * with a numeric value and a text label by its caller so severity is
 * never colour-alone.
 */
export function Meter({
  value,
  max = 100,
  tone = 'signal',
  className,
}: {
  value: number;
  max?: number;
  tone?: 'up' | 'caution' | 'down' | 'signal';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div
      className={cn('h-0.5 w-full bg-line', className)}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn(
          'h-0.5 transition-[width] duration-700 ease-out-quint',
          tone === 'up' && 'bg-up',
          tone === 'caution' && 'bg-caution',
          tone === 'down' && 'bg-down',
          tone === 'signal' && 'bg-signal'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
