import { cn } from '@/lib/utils';

/**
 * A region of a workspace screen.
 *
 * A block is a label, a rule, and content — no border, no background,
 * no radius. It is what a card becomes once you stop drawing the box:
 * the label and the rule do all the separating, so a screen of eight
 * blocks still reads as one surface.
 */
export function Block({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn('flex min-w-0 flex-col', className)}>{children}</section>;
}

export function BlockHead({
  label,
  aside,
  className,
}: {
  label: string;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 border-b border-line pb-3',
        className
      )}
    >
      <h2 className="t-micro">{label}</h2>
      {aside}
    </div>
  );
}

/**
 * An intentional empty state: what is missing, and the one thing the
 * reader can do about it. Bracketed rather than boxed.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bracket flex flex-col items-start gap-3 px-6 py-10',
        className
      )}
    >
      <h3 className="font-display text-[1.125rem] text-ink-dim">{title}</h3>
      <p className="max-w-[26rem] text-[0.8125rem] leading-relaxed text-ink-faint">
        {description}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A calm, informative failure. Never a red box with a warning icon. */
export function ErrorState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 border-l-2 border-down/50 pl-5', className)}>
      <div className="flex items-center gap-2.5">
        <span className="t-micro text-down">Error</span>
        <h3 className="text-[0.9375rem] font-medium text-ink">{title}</h3>
      </div>
      <p className="max-w-[30rem] text-[0.8125rem] leading-relaxed text-ink-faint">
        {description}
      </p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
