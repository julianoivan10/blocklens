import { cn } from '@/lib/utils';

type MarkSize = 'sm' | 'md' | 'lg';

const SIZES: Record<MarkSize, string> = {
  sm: 'size-7 text-[0.5625rem]',
  md: 'size-9 text-[0.625rem]',
  lg: 'size-14 text-[0.8125rem]',
};

/**
 * An asset identifier plate.
 *
 * Replaces the tinted accent chip that previously stood in for every
 * token: unfilled, hairline-ruled, monospace. It reads as a specimen
 * label rather than an app icon, and it costs the accent colour
 * nothing — the accent stays reserved for interaction.
 */
export function AssetMark({
  symbol,
  size = 'md',
  className,
}: {
  symbol: string;
  size?: MarkSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-line bg-panel-sunken',
        'font-mono font-medium uppercase tracking-tight text-ink-dim',
        'transition-colors duration-200',
        'group-hover:border-line-strong group-hover:text-ink',
        SIZES[size],
        className
      )}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}
