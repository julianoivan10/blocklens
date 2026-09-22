import { cn } from '@/lib/utils';

/**
 * Horizontal bars for shares of a whole and signed amounts.
 *
 * Every bar carries its value as text beside it, so the figure never
 * depends on reading a length. Shares use one hue (magnitude, not
 * identity); signed bars use the up/down marks plus an explicit sign and
 * glyph, never colour alone.
 */

export function ShareBars({
  rows,
  className,
  emptyText = 'Nothing to show.',
}: {
  rows: Array<{ key: string; label: string; sublabel?: string; pct: number; value: string }>;
  className?: string;
  emptyText?: string;
}) {
  if (rows.length === 0) return <p className="t-body-sm py-6 text-ink-faint">{emptyText}</p>;
  const max = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-4" title={`${r.label}: ${r.pct.toFixed(2)}% · ${r.value}`}>
          <span className="min-w-0 truncate text-[0.8125rem] text-ink-dim">
            {r.label}
            {r.sublabel && <span className="ml-1.5 text-[0.6875rem] text-ink-ghost">{r.sublabel}</span>}
          </span>
          <span className="h-2 w-full bg-line-faint" aria-hidden="true">
            <span
              className="block h-2 rounded-r-[4px] bg-plot-1"
              style={{ width: `${Math.max(0.5, (r.pct / max) * 100)}%` }}
            />
          </span>
          <span className="w-28 text-right font-mono text-[0.75rem] tabular-nums text-ink">
            {r.pct.toFixed(1)}% <span className="text-ink-ghost">· {r.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SignedBars({
  rows,
  format,
  className,
}: {
  rows: Array<{ key: string; label: string; value: number }>;
  format: (n: number) => string;
  className?: string;
}) {
  if (rows.length === 0) return <p className="t-body-sm py-6 text-ink-faint">Insufficient data — no position has a known cost and a current price.</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {rows.map((r) => {
        const width = (Math.abs(r.value) / max) * 50;
        const up = r.value >= 0;
        return (
          <li key={r.key} className="grid grid-cols-[minmax(4rem,7rem)_1fr_auto] items-center gap-4" title={`${r.label}: ${format(r.value)}`}>
            <span className="truncate text-[0.8125rem] text-ink-dim">{r.label}</span>
            <span className="relative h-2 w-full" aria-hidden="true">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
              <span
                className={cn('absolute inset-y-0', up ? 'left-1/2 rounded-r-[4px] bg-up-mark' : 'right-1/2 rounded-l-[4px] bg-down-mark')}
                style={{ width: `${Math.max(0.5, width)}%` }}
              />
            </span>
            <span className={cn('w-28 text-right font-mono text-[0.75rem] tabular-nums', up ? 'text-up' : 'text-down')}>
              <span aria-hidden="true" className="mr-1 text-[0.75em]">{up ? '▲' : '▼'}</span>
              {format(r.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
