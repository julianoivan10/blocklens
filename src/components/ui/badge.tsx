import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'up' | 'down' | 'caution' | 'signal' | 'demo';

const TONES: Record<Tone, string> = {
  neutral: 'border-line text-ink-faint',
  up: 'border-up/30 text-up',
  down: 'border-down/30 text-down',
  caution: 'border-caution/30 text-caution',
  signal: 'border-signal-deep/50 text-signal',
  /* Reserved for the mock-data marker, so provenance always looks the
     same wherever it appears. */
  demo: 'border-dashed border-line-strong text-ink-ghost',
};

/**
 * A tag. Unfilled and hairline-ruled — the tinted pill is the pattern
 * this replaces. Text always carries the meaning; the tone only
 * reinforces it.
 */
export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-1.5 py-0.5',
        'font-mono text-[0.625rem] font-medium uppercase tracking-widest',
        TONES[tone],
        className
      )}
      {...props}
    />
  );
}

export type { Tone as BadgeTone };
