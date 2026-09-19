import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Container, SectionMark } from '@/components/ui/section';
import { FieldBackdrop } from '@/components/visual/field-backdrop';
import { MarketRail, MarketRailSkeleton } from './market-rail';

/**
 * The hero.
 *
 * The composition is deliberately left-weighted and deliberately empty
 * on the right: the backdrop light sits there, and that negative space
 * is what makes the headline read as confident rather than crowded.
 * Nothing is added to fill it.
 *
 * Hierarchy runs mark → headline → lede → action, with the spacing
 * widening at each step so the eye lands on the headline first and the
 * supporting line reads as subordinate rather than as a second heading.
 * The lede is set to a far narrower measure than the headline for the
 * same reason.
 *
 * The hero ends on live figures rather than on feature bullets — the
 * market rail is the product's first actual output.
 */
export function HeroSection() {
  return (
    <section className="relative isolate flex min-h-[94svh] flex-col overflow-hidden">
      <FieldBackdrop horizon="76%" />

      <Container className="relative flex flex-1 items-center pb-20 pt-32 sm:pt-36">
        <div className="max-w-[48rem]">
          <SectionMark index="01" label="Crypto research intelligence" className="anim-rise" />

          {/* Ragged-right rather than balanced and centred: the emphasis
              lands on the second line, so the block has an uneven edge
              on purpose. */}
          <h1 className="t-display mt-9 text-ink">
            Understand crypto
            <br />
            <span className="t-accent">beyond the price.</span>
          </h1>

          <p className="t-lede mt-10 max-w-[33rem]">
            Market data, on-chain activity, tokenomics, project signals and news for any
            asset — read as one research dossier, with AI synthesis kept clearly separate
            from the figures it reasons over.
          </p>

          <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link href={ROUTES.register}>
              <Button variant="primary" size="lg">
                Start researching
              </Button>
            </Link>

            {/* A text link, not a second button competing with the first. */}
            <Link
              href="#dossier"
              className="group inline-flex items-center gap-2 text-[0.875rem] text-ink-dim transition-colors hover:text-ink"
            >
              See a research dossier
              <ArrowRight className="size-3.5 transition-transform duration-300 ease-out-quint group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </Container>

      {/* Streams in behind its own boundary, so a slow provider delays
          the rail rather than the headline. */}
      <Suspense fallback={<MarketRailSkeleton />}>
        <MarketRail />
      </Suspense>
    </section>
  );
}
