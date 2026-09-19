import { Container } from '@/components/ui/section';
import { PrimaryCta } from './primary-cta';

/**
 * The close.
 *
 * A full-bleed rule, a large left-aligned statement, one action. No
 * bordered gradient box, no second button competing with the first.
 */
export function ClosingSection() {
  return (
    <section className="relative overflow-hidden border-t border-line">
      <div aria-hidden="true" className="aura absolute inset-x-0 bottom-0 top-auto h-full rotate-180" />

      <Container className="relative py-24 sm:py-32 lg:py-40">
        <div className="max-w-[40rem]">
          <span className="t-micro">Start researching</span>

          <h2 className="t-display mt-7 text-ink">
            Look at an asset
            <br />
            <span className="t-accent">properly.</span>
          </h2>

          <p className="t-lede mt-8 max-w-[32rem]">
            Market data, on-chain activity and news are live. Every figure is labelled with
            where it came from, and anything a provider cannot supply is left out rather
            than filled in.
          </p>

          <PrimaryCta className="mt-10" note="No card required" />
        </div>
      </Container>
    </section>
  );
}
