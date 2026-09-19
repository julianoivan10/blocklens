import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Container, SectionMark } from '@/components/ui/section';
import { Wordmark } from '@/components/brand/logo';
import { ROUTES } from '@/lib/constants';

export const metadata = { title: 'Page not found' };

/**
 * The root 404. Built from the same vocabulary as the rest of the
 * product — the measurement field, a mono marker, display type — so a
 * missing page still looks like BlockLens.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden="true" className="field-grid field-fade absolute inset-0 opacity-60" />
      <div aria-hidden="true" className="aura absolute inset-0" />

      <Container className="relative flex flex-1 flex-col">
        <div className="py-8">
          <Link href={ROUTES.home} className="w-fit rounded-xs">
            <Wordmark />
          </Link>
        </div>

        <div className="flex flex-1 items-center">
          <div className="max-w-[34rem]">
            <SectionMark index="404" label="No reading" />

            <h1 className="t-display-sm mt-6 text-ink">
              Nothing at this address.
            </h1>

            <p className="t-body mt-5">
              The page you asked for doesn&rsquo;t exist. It may have moved, or the link may
              have been mistyped.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={ROUTES.home}>
                <Button variant="primary" size="md">
                  Back to home
                </Button>
              </Link>
              <Link href={`${ROUTES.research}/BTC`}>
                <Button variant="line" size="md">
                  Open a dossier
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
