import { cn } from '@/lib/utils';
import { Container, SectionMark } from '@/components/ui/section';

/**
 * One chapter of a dossier.
 *
 * A rule, an ordinal, a label, and a heading in the display serif —
 * then the content. Every section shares this opening so the page reads
 * as a document with chapters, which is the whole point of dropping the
 * tab strip.
 */
export function ResearchSection({
  id,
  ordinal,
  label,
  title,
  intro,
  aside,
  children,
  className,
}: {
  id: string;
  ordinal: string;
  label: string;
  title: string;
  intro?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      // Offset so an anchor jump does not tuck the heading under the
      // sticky top bar.
      className={cn('scroll-mt-20 border-t border-line py-14 sm:py-16', className)}
    >
      <Container>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="max-w-[40rem]">
            <SectionMark index={ordinal} label={label} />

            <h2 className="t-editorial mt-4 text-ink">{title}</h2>
            {intro && <p className="t-body mt-3">{intro}</p>}
          </div>

          {aside && <div className="shrink-0 lg:pt-1">{aside}</div>}
        </div>

        <div className="mt-10">{children}</div>
      </Container>
    </section>
  );
}
