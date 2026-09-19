import { cn } from '@/lib/utils';

/**
 * Page gutters. One measure for the whole product so every screen
 * shares a left edge — the thing that makes a layout feel drawn
 * rather than assembled.
 */
export function Container({
  children,
  className,
  width = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  width?: 'default' | 'wide' | 'reading';
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-5 sm:px-8 lg:px-12',
        width === 'default' && 'max-w-[84rem]',
        width === 'wide' && 'max-w-[110rem]',
        width === 'reading' && 'max-w-[46rem]',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * A section marker: an ordinal and a label set against a hairline.
 * The numbering is part of the identity — it frames the product as a
 * document with a structure rather than a page with panels.
 */
export function SectionMark({
  index,
  label,
  className,
}: {
  index?: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {index && (
        <>
          <span className="t-micro-tight text-signal-deep">{index}</span>
          <span aria-hidden="true" className="h-px w-6 bg-line-strong" />
        </>
      )}
      <span className="t-micro">{label}</span>
    </div>
  );
}

/** Vertical rhythm between major sections. */
export function Section({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('py-20 sm:py-28 lg:py-36', className)}>
      {children}
    </section>
  );
}
