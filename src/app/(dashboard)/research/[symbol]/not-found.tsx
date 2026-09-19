import Link from 'next/link';
import { Container } from '@/components/ui/section';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants';

/**
 * An asset the providers do not cover. Calm and specific about what to
 * do next, rather than a generic error page.
 */
export default function ResearchNotFound() {
  return (
    <Container className="py-24">
      <div className="max-w-[34rem]">
        <span className="t-micro">No coverage</span>

        <h1 className="t-display-sm mt-5 text-ink">This asset isn&rsquo;t covered yet.</h1>

        <p className="t-body mt-5">
          The configured data providers returned nothing for that ticker. Full dossiers are
          available for Bitcoin, Ethereum and Solana, with partial coverage for several
          others — or search for something else.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href={`${ROUTES.research}/BTC`}>
            <Button variant="primary" size="md">
              Open BTC
            </Button>
          </Link>
          <Link href={ROUTES.research}>
            <Button variant="line" size="md">
              Browse coverage
            </Button>
          </Link>
        </div>
      </div>
    </Container>
  );
}
