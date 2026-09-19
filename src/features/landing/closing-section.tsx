import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/section';

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
            Free to open an account. Every figure is labelled with where it came from, and
            connecting your own provider keys turns the mock feeds live.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link href={ROUTES.register}>
              <Button variant="primary" size="lg">
                Create an account
              </Button>
            </Link>
            <span className="t-micro-tight text-ink-ghost">No card required</span>
          </div>
        </div>
      </Container>
    </section>
  );
}
